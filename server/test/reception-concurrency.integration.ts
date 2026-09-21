import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import {
  AppointmentStatus,
  CounterPaymentMethod,
  Gender,
  PaymentMethod,
  PaymentStatus,
  SlotStatus,
} from '@shared/enums';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/common/redis/redis.service';
import { environment } from '../src/config/environment';
import { createDataSource } from '../src/database/database-options';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { QueueGateway } from '../src/modules/realtime/queue.gateway';
import { QueueQueryService } from '../src/modules/realtime/queue-query.service';
import { CounterPaymentService } from '../src/modules/reception/counter-payment.service';
import { QueueNumberService } from '../src/modules/reception/queue-number.service';
import { ReceptionService } from '../src/modules/reception/reception.service';
import { WalkInService } from '../src/modules/reception/walk-in.service';

const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith('/ehealth_reception_test_')) {
  throw new Error('TEST_DATABASE_URL must target a dedicated ehealth_reception_test_* database.');
}

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

jest.mock('../src/common/utils/vn-time.util', () => ({
  vietnamNow: () => ({
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()),
    time: '09:00:00',
  }),
}));

describe('Reception concurrency on PostgreSQL', () => {
  let database: DataSource;
  let reception: ReceptionService;
  let payments: CounterPaymentService;
  let walkIn: WalkInService;
  let events: { statusChanged: jest.Mock };
  let redis: { setNxEx: jest.Mock; releaseLockIfOwner: jest.Mock; get: jest.Mock };
  let doctorId: string;
  let receptionistId: string;
  let patientId: string;

  async function user(name: string, contact: string): Promise<string> {
    const [row] = await database.query(
      `INSERT INTO users (email, full_name, gender, date_of_birth, status)
       VALUES ($1, $2, 'MALE', '1990-01-01', 'ACTIVE') RETURNING id`,
      [contact, name],
    );
    return row.id as string;
  }

  async function slot(
    status: SlotStatus,
    startTime = '10:00:00',
    endTime = '10:30:00',
  ): Promise<string> {
    const [row] = await database.query(
      `INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [doctorId, today, startTime, endTime, status],
    );
    return row.id as string;
  }

  async function appointment(scheduleId: string, paymentStatus: PaymentStatus): Promise<string> {
    const [row] = await database.query(
      `INSERT INTO appointments
       (appointment_code, patient_id, doctor_id, schedule_id, status,
        reason_for_visit, payment_status, payment_method, total_amount)
       VALUES ($1, $2, $3, $4, 'CONFIRMED', 'Khám tổng quát', $5, 'PAY_AT_CLINIC', 300000)
       RETURNING id`,
      [`APT-${randomUUID().slice(0, 16)}`, patientId, doctorId, scheduleId, paymentStatus],
    );
    return row.id as string;
  }

  function walkInRequest(scheduleId: string, phone: string) {
    return {
      scheduleId, fullName: 'Khách vãng lai', phone, birthYear: 1985,
      gender: Gender.MALE, reasonForVisit: 'Đau đầu',
      paymentMethod: CounterPaymentMethod.CASH, amountTendered: 300000,
    };
  }

  beforeAll(async () => {
    database = await createDataSource(url!).initialize();
    await database.runMigrations();
    const queueNumbers = new QueueNumberService();
    events = {
      statusChanged: jest.fn(async (appointmentId: string) => {
        const [row] = await database.query(
          'SELECT status, queue_number FROM appointments WHERE id = $1', [appointmentId],
        );
        expect(row.status).toBe(AppointmentStatus.CHECKED_IN);
        expect(row.queue_number).toBeGreaterThan(0);
      }),
    };
    payments = new CounterPaymentService(database);
    reception = new ReceptionService(database, queueNumbers, events as unknown as QueueEventsService);
    redis = {
      setNxEx: jest.fn(async () => true),
      releaseLockIfOwner: jest.fn(async () => true),
      get: jest.fn(async () => null),
    };
    walkIn = new WalkInService(
      database, redis as unknown as RedisService, queueNumbers, payments,
      events as unknown as QueueEventsService,
    );
  });

  beforeEach(async () => {
    await database.query('TRUNCATE specialties, users CASCADE');
    events.statusChanged.mockClear();
    redis.setNxEx.mockClear();
    redis.releaseLockIfOwner.mockClear();
    patientId = await user('Bệnh nhân đã đặt', `${randomUUID()}@patient.test`);
    receptionistId = await user('Lễ tân', `${randomUUID()}@reception.test`);
    const doctorUserId = await user('Bác sĩ', `${randomUUID()}@doctor.test`);
    const [specialty] = await database.query(
      `INSERT INTO specialties (name) VALUES ($1) RETURNING id`, [`Nội khoa ${randomUUID()}`],
    );
    const [doctor] = await database.query(
      `INSERT INTO doctors
       (user_id, specialty_id, license_number, consultation_fee, room_number)
       VALUES ($1, $2, $3, 300000, 'P101') RETURNING id`,
      [doctorUserId, specialty.id, randomUUID()],
    );
    doctorId = doctor.id as string;
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  afterEach(() => jest.restoreAllMocks());

  it('allows only one concurrent check-in and emits after commit', async () => {
    const id = await appointment(await slot(SlotStatus.BOOKED), PaymentStatus.PAID);
    const results = await Promise.allSettled([reception.checkIn(id), reception.checkIn(id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(ConflictException) });
    const [row] = await database.query(
      'SELECT status, queue_number, checked_in_at FROM appointments WHERE id = $1', [id],
    );
    expect(row).toMatchObject({ status: AppointmentStatus.CHECKED_IN, queue_number: 1 });
    expect(row.checked_in_at).not.toBeNull();
    expect(events.statusChanged).toHaveBeenCalledTimes(1);
  });

  it('allocates distinct queue numbers for concurrent appointments of one doctor', async () => {
    const ids = await Promise.all([
      appointment(await slot(SlotStatus.BOOKED), PaymentStatus.PAID),
      appointment(await slot(SlotStatus.BOOKED, '11:00:00', '11:30:00'), PaymentStatus.PAID),
    ]);
    const responses = await Promise.all(ids.map((id) => reception.checkIn(id)));
    expect(responses.map((item) => item.queueNumber).sort()).toEqual([1, 2]);
    const [counter] = await database.query(
      'SELECT last_number FROM doctor_queue_counters WHERE doctor_id = $1 AND queue_date = $2',
      [doctorId, today],
    );
    expect(counter.last_number).toBe(2);
  });

  it('persists one cash payment under concurrent collection and reprints the same receipt', async () => {
    const id = await appointment(await slot(SlotStatus.BOOKED), PaymentStatus.UNPAID);
    const dto = { method: CounterPaymentMethod.CASH, amountTendered: 500000 };
    const results = await Promise.allSettled([
      payments.collect(id, receptionistId, dto), payments.collect(id, receptionistId, dto),
    ]);
    const success = results.find((result) => result.status === 'fulfilled');
    expect(success).toMatchObject({ status: 'fulfilled' });
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [count] = await database.query(
      `SELECT COUNT(*)::int AS count FROM counter_payment_transactions
       WHERE appointment_id = $1 AND status = 'SUCCESS'`, [id],
    );
    expect(count.count).toBe(1);
    expect(await payments.getReceipt(id)).toEqual((success as PromiseFulfilledResult<unknown>).value);
  });

  it('books only one walk-in for the last slot even if both requests acquire a Redis lock', async () => {
    const scheduleId = await slot(SlotStatus.AVAILABLE);
    const results = await Promise.allSettled([
      walkIn.book(walkInRequest(scheduleId, '0912345678'), receptionistId, randomUUID()),
      walkIn.book(walkInRequest(scheduleId, '0912345679'), receptionistId, randomUUID()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [counts] = await database.query(
      `SELECT (SELECT COUNT(*)::int FROM appointments WHERE schedule_id = $1) AS appointments,
              (SELECT COUNT(*)::int FROM counter_payment_transactions) AS payments`, [scheduleId],
    );
    expect(counts).toEqual({ appointments: 1, payments: 1 });
    const queue = await new QueueQueryService(database).snapshot('DOCTOR', doctorId);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({ queueNumber: 1, status: AppointmentStatus.CHECKED_IN });
    expect(events.statusChanged).toHaveBeenCalledTimes(1);
  });

  it('returns the committed walk-in on retry without another payment or queue number', async () => {
    const scheduleId = await slot(SlotStatus.AVAILABLE);
    const key = randomUUID();
    const request = walkInRequest(scheduleId, '0912345678');
    const first = await walkIn.book(request, receptionistId, key);
    const second = await walkIn.book(request, receptionistId, key);
    expect(second).toEqual(first);
    expect(events.statusChanged).toHaveBeenCalledTimes(1);
    const [counts] = await database.query(
      `SELECT (SELECT COUNT(*)::int FROM appointments WHERE schedule_id = $1) AS appointments,
              (SELECT COUNT(*)::int FROM counter_payment_transactions) AS payments,
              (SELECT last_number FROM doctor_queue_counters WHERE doctor_id = $2 AND queue_date = $3)
                AS last_number`, [scheduleId, doctorId, today],
    );
    expect(counts).toEqual({ appointments: 1, payments: 1, last_number: 1 });
  });

  it('rolls back slot, appointment, and queue number when walk-in payment fails', async () => {
    const scheduleId = await slot(SlotStatus.AVAILABLE);
    jest.spyOn(payments, 'recordCashPayment').mockRejectedValueOnce(new Error('payment failed'));
    await expect(walkIn.book(
      walkInRequest(scheduleId, '0912345678'), receptionistId, randomUUID(),
    )).rejects.toThrow('payment failed');
    const [schedule] = await database.query(
      'SELECT status FROM doctor_schedules WHERE id = $1', [scheduleId],
    );
    const [counts] = await database.query(
      `SELECT (SELECT COUNT(*)::int FROM appointments WHERE schedule_id = $1) AS appointments,
              (SELECT COUNT(*)::int FROM doctor_queue_counters WHERE doctor_id = $2) AS counters`,
      [scheduleId, doctorId],
    );
    expect(schedule.status).toBe(SlotStatus.AVAILABLE);
    expect(counts).toEqual({ appointments: 0, counters: 0 });
    expect(redis.releaseLockIfOwner).toHaveBeenCalledTimes(1);
    expect(events.statusChanged).not.toHaveBeenCalled();
  });

  it('keeps a committed check-in when WebSocket publication fails', async () => {
    const id = await appointment(await slot(SlotStatus.BOOKED), PaymentStatus.PAID);
    const failingGateway = { emitToRoom: () => { throw new Error('socket offline'); } };
    const eventService = new QueueEventsService(
      new QueueQueryService(database), failingGateway as unknown as QueueGateway,
    );
    const service = new ReceptionService(database, new QueueNumberService(), eventService);
    await expect(service.checkIn(id)).resolves.toMatchObject({
      status: AppointmentStatus.CHECKED_IN, queueNumber: 1,
    });
    const [row] = await database.query(
      'SELECT status, queue_number FROM appointments WHERE id = $1', [id],
    );
    expect(row).toMatchObject({ status: AppointmentStatus.CHECKED_IN, queue_number: 1 });
  });
});
