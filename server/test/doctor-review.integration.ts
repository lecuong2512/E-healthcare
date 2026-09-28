import 'reflect-metadata';
import './test-environment';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppointmentStatus } from '@shared/enums';
import { createDataSource } from '../src/database/database-options';
import { environment } from '../src/config/environment';
import { DoctorCacheService } from '../src/modules/doctor/doctor-cache.service';
import { DoctorReviewService } from '../src/modules/doctor/doctor-review.service';
import { DoctorSearchService } from '../src/modules/doctor/doctor-search.service';

const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith('/ehealth_review_test_')) {
  throw new Error(
    'TEST_DATABASE_URL must target a dedicated ehealth_review_test_* database.',
  );
}
const testRedisUrl = environment.TEST_REDIS_URL;
const redisTest =
  testRedisUrl && new URL(testRedisUrl).pathname === '/15' ? it : it.skip;

describe('Doctor review concurrency on PostgreSQL', () => {
  let database: DataSource;
  let service: DoctorReviewService;
  let doctorId: string;
  let patientIds: string[];
  let nextAppointmentCode: number;
  const cache = {
    invalidateDoctorData: jest.fn().mockResolvedValue(undefined),
  } as unknown as DoctorCacheService;

  async function createUser(name: string): Promise<string> {
    const [row] = await database.query(
      `INSERT INTO users (email, full_name, gender, date_of_birth, status)
       VALUES ($1, $2, 'MALE', '1990-01-01', 'ACTIVE') RETURNING id`,
      [`${randomUUID()}@review.test`, name],
    );
    return row.id as string;
  }

  async function createCompletedAppointment(patientId: string): Promise<string> {
    const appointmentCode = nextAppointmentCode++;
    const [schedule] = await database.query(
      `INSERT INTO doctor_schedules
       (doctor_id, date, start_time, end_time, status)
       VALUES ($1, '2026-09-28', $2, $3, 'BOOKED') RETURNING id`,
      [
        doctorId,
        `${String(appointmentCode).padStart(2, '0')}:00:00`,
        `${String(appointmentCode).padStart(2, '0')}:30:00`,
      ],
    );
    const [appointment] = await database.query(
      `INSERT INTO appointments
       (appointment_code, patient_id, doctor_id, schedule_id, status,
        reason_for_visit, payment_status, payment_method, total_amount)
       VALUES ($1, $2, $3, $4, $5, 'Khám tổng quát', 'PAID', 'PAY_AT_CLINIC', 300000)
       RETURNING id`,
      [
        `APT-REV-${appointmentCode}`,
        patientId,
        doctorId,
        schedule.id,
        AppointmentStatus.COMPLETED,
      ],
    );
    return appointment.id as string;
  }

  beforeAll(async () => {
    database = await createDataSource(url).initialize();
    await database.runMigrations();
    service = new DoctorReviewService(database, cache);
  });

  beforeEach(async () => {
    await database.query('TRUNCATE specialties, users CASCADE');
    nextAppointmentCode = 8;
    patientIds = await Promise.all([
      createUser('Bệnh nhân A'),
      createUser('Bệnh nhân B'),
    ]);
    const doctorUserId = await createUser('Bác sĩ Review');
    const [specialty] = await database.query(
      'INSERT INTO specialties (name) VALUES ($1) RETURNING id',
      [`Nội khoa ${randomUUID()}`],
    );
    const [doctor] = await database.query(
      `INSERT INTO doctors
       (user_id, specialty_id, license_number, consultation_fee, room_number, rating_average)
       VALUES ($1, $2, $3, 300000, 'P101', 1.00) RETURNING id`,
      [doctorUserId, specialty.id, randomUUID()],
    );
    doctorId = doctor.id as string;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('persists exactly one review for concurrent duplicate requests', async () => {
    const appointmentId = await createCompletedAppointment(patientIds[0]);
    const results = await Promise.allSettled([
      service.create(doctorId, patientIds[0], { appointmentId, rating: 5 }),
      service.create(doctorId, patientIds[0], { appointmentId, rating: 5 }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(ConflictException) });
    const [reviewCount] = await database.query(
      'SELECT COUNT(*)::int AS total FROM doctor_reviews WHERE appointment_id = $1',
      [appointmentId],
    );
    const [doctor] = await database.query(
      'SELECT rating_average::float AS rating_average FROM doctors WHERE id = $1',
      [doctorId],
    );
    expect(reviewCount.total).toBe(1);
    expect(doctor.rating_average).toBe(5);
  });

  it('keeps the correct average for concurrent reviews of different appointments', async () => {
    const appointmentIds = await Promise.all([
      createCompletedAppointment(patientIds[0]),
      createCompletedAppointment(patientIds[1]),
    ]);

    await Promise.all([
      service.create(doctorId, patientIds[0], {
        appointmentId: appointmentIds[0],
        rating: 5,
      }),
      service.create(doctorId, patientIds[1], {
        appointmentId: appointmentIds[1],
        rating: 3,
      }),
    ]);

    const [reviewCount] = await database.query(
      'SELECT COUNT(*)::int AS total FROM doctor_reviews WHERE doctor_id = $1',
      [doctorId],
    );
    const [doctor] = await database.query(
      'SELECT rating_average::float AS rating_average FROM doctors WHERE id = $1',
      [doctorId],
    );
    expect(reviewCount.total).toBe(2);
    expect(doctor.rating_average).toBe(4);
  });

  redisTest('refreshes cached doctor list and detail ratings after a review', async () => {
    const previousRedisUrl = environment.REDIS_URL;
    environment.REDIS_URL = testRedisUrl;
    const realCache = new DoctorCacheService();
    const redisClient = (
      realCache as unknown as {
        client: {
          connect(): Promise<void>;
          flushDb(): Promise<string>;
        };
      }
    ).client;

    try {
      await redisClient.connect();
      await redisClient.flushDb();
      const search = new DoctorSearchService(database, realCache);
      const reviews = new DoctorReviewService(database, realCache);
      const appointmentId = await createCompletedAppointment(patientIds[0]);

      const initialList = await search.search({ page: 1, limit: 10 });
      const initialDetail = (await search.findOne(doctorId)) as {
        ratingAverage: number;
      };
      expect(initialList.data[0].ratingAverage).toBe(1);
      expect(initialDetail.ratingAverage).toBe(1);

      await reviews.create(doctorId, patientIds[0], {
        appointmentId,
        rating: 5,
      });

      const refreshedList = await search.search({ page: 1, limit: 10 });
      const refreshedDetail = (await search.findOne(doctorId)) as {
        ratingAverage: number;
      };
      expect(refreshedList.data[0].ratingAverage).toBe(5);
      expect(refreshedDetail.ratingAverage).toBe(5);
    } finally {
      await redisClient.flushDb();
      realCache.onApplicationShutdown();
      environment.REDIS_URL = previousRedisUrl;
    }
  });
});
