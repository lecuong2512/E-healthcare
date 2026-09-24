import './test-environment';
import { performance } from 'node:perf_hooks';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppointmentStatus, Role } from '@shared/enums';
import {
  PublicQueueSnapshot,
  PublicQueueStatusChanged,
} from '@shared/interfaces';
import {
  QUEUE_NAMESPACE,
  QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
  QUEUE_SNAPSHOT_EVENT,
} from '../../shared/src/constants/queue-socket.constants';
import Redis from 'ioredis';
import { io, Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/common/redis/redis.service';
import { environment } from '../src/config/environment';
import { createDataSource } from '../src/database/database-options';
import { AppointmentLifecycleService } from '../src/modules/appointment/appointment-lifecycle.service';
import { SessionService } from '../src/modules/auth/session.service';
import { NotificationProducerService } from '../src/modules/notification/producers/notification-producer.service';
import { QueueBoardTokenService } from '../src/modules/realtime/queue-board-token.service';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { QueueGateway } from '../src/modules/realtime/queue.gateway';
import { QueueQueryService } from '../src/modules/realtime/queue-query.service';
import { RedisIoAdapter } from '../src/modules/realtime/redis-io.adapter';

const databaseUrl = environment.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !new URL(databaseUrl).pathname.startsWith('/ehealth_queue_board_test_')
) {
  throw new Error(
    'TEST_DATABASE_URL must target a dedicated ehealth_queue_board_test_* database.',
  );
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      5_000,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

describe('Queue Board PostgreSQL + Redis + Socket.IO E2E', () => {
  let database: DataSource;
  let app: INestApplication;
  let redisClient: Redis;
  let redisAdapter: RedisIoAdapter;
  let lifecycle: AppointmentLifecycleService;
  let boardTokens: QueueBoardTokenService;
  let socket: Socket | undefined;
  let appointmentId: string;
  let doctorUserId: string;

  beforeAll(async () => {
    database = await createDataSource(databaseUrl).initialize();
    await database.runMigrations();

    const module = await Test.createTestingModule({
      providers: [
        { provide: DataSource, useValue: database },
        {
          provide: SessionService,
          useValue: { authenticate: jest.fn() },
        },
        {
          provide: NotificationProducerService,
          useValue: {
            enqueueAppointmentCancellationEmail: jest.fn(),
            enqueueAppointmentCancellationSms: jest.fn(),
          },
        },
        QueueQueryService,
        QueueBoardTokenService,
        QueueGateway,
        QueueEventsService,
        AppointmentLifecycleService,
      ],
    }).compile();

    app = module.createNestApplication();
    redisClient = new Redis({
      host: '127.0.0.1',
      port: Number(environment.TEST_REDIS_PORT),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redisAdapter = new RedisIoAdapter(app, new RedisService(redisClient));
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);
    await app.listen(0, '127.0.0.1');

    lifecycle = module.get(AppointmentLifecycleService);
    boardTokens = module.get(QueueBoardTokenService);
  });

  beforeEach(async () => {
    await database.query('TRUNCATE specialties, users CASCADE');
    const [patient] = await database.query(
      `INSERT INTO users (email, full_name, gender, date_of_birth, status)
       VALUES ($1, 'Nguyễn Văn An', 'MALE', '1990-01-01', 'ACTIVE')
       RETURNING id`,
      [`queue-patient-${Date.now()}@example.invalid`],
    );
    const [doctorUser] = await database.query(
      `INSERT INTO users (email, full_name, gender, date_of_birth, status)
       VALUES ($1, 'Trần Minh Bình', 'MALE', '1980-01-01', 'ACTIVE')
       RETURNING id`,
      [`queue-doctor-${Date.now()}@example.invalid`],
    );
    doctorUserId = doctorUser.id as string;
    const [specialty] = await database.query(
      `INSERT INTO specialties (name) VALUES ('Tim mạch') RETURNING id`,
    );
    const [doctor] = await database.query(
      `INSERT INTO doctors
       (user_id, specialty_id, license_number, consultation_fee, room_number)
       VALUES ($1, $2, $3, 300000, 'P.201') RETURNING id`,
      [doctorUserId, specialty.id, `QUEUE-${Date.now()}`],
    );
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [schedule] = await database.query(
      `INSERT INTO doctor_schedules
       (doctor_id, date, start_time, end_time, status)
       VALUES ($1, $2, '09:00:00', '09:30:00', 'BOOKED') RETURNING id`,
      [doctor.id, today],
    );
    const [appointment] = await database.query(
      `INSERT INTO appointments
       (appointment_code, patient_id, doctor_id, schedule_id, status,
        reason_for_visit, payment_status, payment_method, total_amount,
        checked_in_at, queue_number, queue_date, queue_source)
       VALUES ($1, $2, $3, $4, 'CHECKED_IN', 'Khám tim mạch', 'PAID',
        'PAY_AT_CLINIC', 300000, NOW(), 12, $5, 'APPOINTMENT')
       RETURNING id`,
      [`APT-QB-${Date.now()}`, patient.id, doctor.id, schedule.id, today],
    );
    appointmentId = appointment.id as string;
  });

  afterEach(() => {
    socket?.disconnect();
    socket = undefined;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (redisAdapter) await redisAdapter.dispose();
    if (redisClient?.status !== 'end') redisClient.disconnect();
    if (database?.isInitialized) {
      await database.query('TRUNCATE specialties, users CASCADE');
      await database.destroy();
    }
  });

  it('delivers a redacted doctor-call event to the TV board in under 500 ms', async () => {
    const address = app.getHttpServer().address() as AddressInfo;
    const token = boardTokens.issue().token;
    socket = io(`http://127.0.0.1:${address.port}${QUEUE_NAMESPACE}`, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      auth: { boardToken: token },
    });

    const snapshotPromise = waitForEvent<PublicQueueSnapshot>(
      socket,
      QUEUE_SNAPSHOT_EVENT,
    );
    socket.connect();
    const snapshot = await snapshotPromise;
    expect(snapshot.items).toEqual([
      expect.objectContaining({
        maskedPatientName: 'Nguyễn V. A.',
        specialtyName: 'Tim mạch',
        status: AppointmentStatus.CHECKED_IN,
      }),
    ]);

    const eventPromise = waitForEvent<PublicQueueStatusChanged>(
      socket,
      QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
    );
    const startedAt = performance.now();
    await lifecycle.transition(
      appointmentId,
      AppointmentStatus.IN_CONSULTATION,
      { userId: doctorUserId, role: Role.DOCTOR },
    );
    const event = await eventPromise;
    const latencyMs = performance.now() - startedAt;
    console.info(`Queue Board E2E latency: ${latencyMs.toFixed(2)} ms`);

    expect(event).toEqual(expect.objectContaining({
      previousStatus: AppointmentStatus.CHECKED_IN,
      status: AppointmentStatus.IN_CONSULTATION,
      ticket: expect.objectContaining({
        maskedPatientName: 'Nguyễn V. A.',
        specialtyName: 'Tim mạch',
      }),
    }));
    expect(JSON.stringify(event)).not.toContain(appointmentId);
    expect(latencyMs).toBeLessThan(500);
  });
});
