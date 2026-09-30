import 'reflect-metadata';
import './test-environment';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentTransactionStatus, SlotStatus } from '@shared/enums';
import { environment } from '../src/config/environment';
import { createDataSource } from '../src/database/database-options';
import { PaymentTransactionEntity } from '../src/database/entities/payment-trans.entity';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { RefundRequestEntity } from '../src/database/entities/refund-request.entity';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { PaymentReconciliationAuditEntity } from '../src/database/entities/payment-reconciliation-audit.entity';
import { RedisService } from '../src/common/redis/redis.service';
import { BookingService } from '../src/modules/booking/booking.service';
import { DoctorSearchService } from '../src/modules/doctor/doctor-search.service';
import { DoctorCacheService } from '../src/modules/doctor/doctor-cache.service';
import { PaymentConfiguration } from '../src/modules/payment/payment-config';
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { PaymentReconciliationService } from '../src/modules/payment/payment-reconciliation.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { PaymentProviderError, PaymentProviderErrorKind } from '../src/modules/payment/providers/payment-provider.error';
import { PaymentProvider } from '../src/modules/payment/providers/payment-provider.interface';
import { VerifiedPaymentResult } from '../src/modules/payment/types/verified-payment-result';

const databaseUrl = environment.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.startsWith('/ehealth_payment_test_')) {
  throw new Error('TEST_DATABASE_URL must target a dedicated ehealth_payment_test_* database.');
}
const redisUrl = environment.TEST_REDIS_URL;
if (!redisUrl) throw new Error('TEST_REDIS_URL is required for payment integration tests.');

describe('Payment invariants on PostgreSQL and Redis', () => {
  let database: DataSource;
  let redis: Redis;
  let patientId: string;
  let otherPatientId: string;
  let doctorId: string;
  let service: PaymentService;
  let provider: jest.Mocked<PaymentProvider>;
  let nextScheduleDay: number;
  let finalizer: PaymentFinalizerService;

  async function user(name: string): Promise<string> {
    const [row] = await database.query(
      `INSERT INTO users (email, full_name, gender, date_of_birth, status)
       VALUES ($1, $2, 'MALE', '1990-01-01', 'ACTIVE') RETURNING id`,
      [`${randomUUID()}@payment.test`, name],
    );
    return row.id as string;
  }

  async function appointment(ownerId = patientId): Promise<string> {
    const scheduleDate = `2099-01-${String(nextScheduleDay++).padStart(2, '0')}`;
    const [schedule] = await database.query(
      `INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, status)
       VALUES ($1, $2, '09:00:00', '09:30:00', $3) RETURNING id`,
      [doctorId, scheduleDate, SlotStatus.HOLDING],
    );
    const reservationId = randomUUID();
    const [row] = await database.query(
      `INSERT INTO appointments
       (appointment_code, patient_id, doctor_id, schedule_id, status, reason_for_visit,
        payment_status, payment_method, total_amount, reservation_id, reservation_expires_at)
       VALUES ($1, $2, $3, $4, $5, 'Integration payment', $6, $7, 300000, $8, NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [
        `APT-${randomUUID().slice(0, 12)}`,
        ownerId,
        doctorId,
        schedule.id,
        AppointmentStatus.PENDING_PAYMENT,
        PaymentStatus.PENDING,
        PaymentMethod.VNPAY,
        reservationId,
      ],
    );
    return row.id as string;
  }

  function createService(configuration: Pick<PaymentConfiguration, 'ensureEnabled'> = {
    ensureEnabled: () => undefined,
  }): PaymentService {
    return new PaymentService(
      database,
      finalizer,
      configuration as PaymentConfiguration,
      provider,
      provider,
    );
  }

  function createReconciliationService(): PaymentReconciliationService {
    return new PaymentReconciliationService(
      database,
      finalizer,
      {
        isEnabled: () => true,
        ensureEnabled: () => undefined,
      } as PaymentConfiguration,
      provider,
      provider,
    );
  }

  function verified(
    transaction: PaymentTransactionEntity,
    state: VerifiedPaymentResult['state'],
    providerTransactionId = `PROVIDER-${transaction.id}`,
    amountVnd = Number(transaction.amountVnd),
  ): VerifiedPaymentResult {
    return {
      provider: transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
      merchantTransactionId: transaction.merchantTransactionId,
      providerTransactionId,
      requestId: transaction.provider === PaymentMethod.MOMO
        ? transaction.requestId || undefined
        : undefined,
      amountVnd,
      state,
      responseCode: state === 'SUCCESS' ? '00' : '99',
      rawProviderStatus: state,
      signatureVerified: true,
      sourceValidated: true,
      sanitizedPayload: {},
    };
  }

  beforeAll(async () => {
    database = await createDataSource(databaseUrl).initialize();
    await database.runMigrations();
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    finalizer = new PaymentFinalizerService(database, new RedisService(redis));
  });

  beforeEach(async () => {
    await database.query('TRUNCATE specialties, users CASCADE');
    nextScheduleDay = 1;
    patientId = await user('Payment Patient');
    otherPatientId = await user('Other Patient');
    const doctorUserId = await user('Payment Doctor');
    const [specialty] = await database.query(
      'INSERT INTO specialties (name) VALUES ($1) RETURNING id',
      [`Payment ${randomUUID()}`],
    );
    const [doctor] = await database.query(
      `INSERT INTO doctors (user_id, specialty_id, license_number, consultation_fee, room_number)
       VALUES ($1, $2, $3, 300000, 'PAY01') RETURNING id`,
      [doctorUserId, specialty.id, randomUUID()],
    );
    doctorId = doctor.id as string;
    provider = {
      initiate: jest.fn(async (context) => ({
        merchantTransactionId: context.merchantTransactionId,
        paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signed=true',
        expiresAt: context.expiresAt,
      })),
      verifyCallback: jest.fn(),
      queryStatus: jest.fn(),
    };
    service = createService();
  });

  afterAll(async () => {
    if (redis) await redis.quit();
    if (database?.isInitialized) await database.destroy();
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses the real isolated Redis service', async () => {
    const key = `payment:integration:${randomUUID()}`;
    await redis.set(key, 'ready', 'EX', 30);
    await expect(redis.get(key)).resolves.toBe('ready');
    await redis.del(key);
  });

  it('keeps a verified failed attempt recoverable and permits an atomic clinic fallback', async () => {
    const appointmentId = await appointment();
    await service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    const transaction = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({ appointmentId });
    await finalizer.finalize(verified(transaction, 'FINAL_FAILED'));
    expect(await service.status(appointmentId, patientId)).toMatchObject({
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT, transactionStatus: PaymentTransactionStatus.FAILED,
      canRetry: true, canSwitchProvider: true, canFallbackToClinic: true,
    });
    await service.fallbackToClinic(appointmentId, patientId);
    const confirmed = await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId });
    expect(confirmed.status).toBe(AppointmentStatus.CONFIRMED);
    expect(confirmed.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect((await database.getRepository(DoctorScheduleEntity).findOneByOrFail({ id: confirmed.scheduleId })).status).toBe(SlotStatus.BOOKED);
    await finalizer.finalize(verified(transaction, 'SUCCESS'));
    expect((await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId })).status).toBe(AppointmentStatus.CONFIRMED);
    expect(await database.getRepository(RefundRequestEntity).countBy({ paymentTransactionId: transaction.id })).toBe(1);
  });

  it('blocks repayment and fallback for reconciliation even with explicit switch consent', async () => {
    const appointmentId = await appointment();
    await service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    await database.getRepository(PaymentTransactionEntity).update({ appointmentId }, { status: PaymentTransactionStatus.RECONCILIATION_REQUIRED });
    expect(await service.status(appointmentId, patientId)).toMatchObject({ canRetry: false, canSwitchProvider: false, canFallbackToClinic: false });
    await expect(service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.MOMO, supersedeActive: true }, '127.0.0.1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.fallbackToClinic(appointmentId, patientId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('continues provider reconciliation after cancelling an uncertain checkout and refunds success once', async () => {
    const appointmentId = await appointment();
    await service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    const repository = database.getRepository(PaymentTransactionEntity);
    const transaction = await repository.findOneByOrFail({ appointmentId });
    const dueAt = new Date(Date.now() - 1000);
    await repository.update(transaction.id, { status: PaymentTransactionStatus.RECONCILIATION_REQUIRED, nextReconcileAt: dueAt });
    await service.cancelPending(appointmentId, patientId);
    const cancelled = await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId });
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
    expect((await database.getRepository(DoctorScheduleEntity).findOneByOrFail({ id: cancelled.scheduleId })).status).toBe(SlotStatus.AVAILABLE);
    const uncertain = await repository.findOneByOrFail({ id: transaction.id });
    expect(uncertain.status).toBe(PaymentTransactionStatus.RECONCILIATION_REQUIRED);
    expect(uncertain.nextReconcileAt).toEqual(dueAt);
    provider.queryStatus.mockResolvedValue(verified(uncertain, 'SUCCESS'));
    await createReconciliationService().reconcileExpired();
    await finalizer.finalize(verified(uncertain, 'SUCCESS'));
    expect((await repository.findOneByOrFail({ id: transaction.id })).status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    expect((await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId })).paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
    expect(await database.getRepository(RefundRequestEntity).countBy({ paymentTransactionId: transaction.id })).toBe(1);
  });

  it('excludes elapsed same-day slots in the real PostgreSQL doctor detail query', async () => {
    await database.query(`INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, status) VALUES
      ($1, (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, '00:00:00', '00:30:00', 'AVAILABLE'),
      ($1, '2099-12-01', '09:00:00', '09:30:00', 'AVAILABLE')`, [doctorId]);
    const cache = { key: () => 'qa-doctor', getJson: async () => null, setJson: async () => undefined };
    const result = await new DoctorSearchService(database, cache as unknown as DoctorCacheService).findOne(doctorId);
    expect(result.availableSchedules).toHaveLength(1);
    expect(result.availableSchedules[0].date).toBe('2099-12-01');
  });

  it('re-seeds future schedules deterministically without reviving existing checkout state', async () => {
    const seed = readFileSync(resolve(__dirname, '../../scripts/seed-patient-payment-demo.sql'), 'utf8');
    await database.query(seed);
    await database.query(`UPDATE doctor_schedules SET date = CURRENT_DATE - 1, start_time = '07:00', end_time = '07:30' WHERE id = '90000000-0000-4000-8000-000000000031'`);
    await database.query(seed);
    await database.query(seed);
    const [summary] = await database.query(`SELECT COUNT(*)::int AS count, bool_and(date > (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS future FROM doctor_schedules WHERE id::text LIKE '90000000-0000-4000-8000-%'`);
    expect(summary).toEqual({ count: 6, future: true });
    const demoPatient = '90000000-0000-4000-8000-000000000001';
    const checkout = await appointment(demoPatient);
    await service.initiate(checkout, demoPatient, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    await database.query('BEGIN');
    try {
      await database.query(readFileSync(resolve(__dirname, '../../scripts/reset-patient-payment-test-data.sql'), 'utf8'));
      await database.query(seed);
      await database.query('COMMIT');
    } catch (error) { await database.query('ROLLBACK'); throw error; }
    expect(await database.getRepository(AppointmentEntity).countBy({ patientId: demoPatient })).toBe(0);
    expect(await database.getRepository(PaymentTransactionEntity).countBy({ patientId: demoPatient })).toBe(0);
  });

  it('cancels owned checkout atomically, releases its voucher and Redis lock, and refunds late success once', async () => {
    const appointmentId = await appointment();
    await service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    const original = await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId });
    const transaction = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({ appointmentId });
    const lockKey = BookingService.formatSlotLockKey(doctorId, original.scheduleId);
    const metadataKey = BookingService.formatReservationKey(original.reservationId!);
    await redis.set(lockKey, original.reservationId!, 'EX', 600);
    await redis.set(metadataKey, JSON.stringify({ patientId }), 'EX', 600);
    await database.query(`INSERT INTO vouchers (user_id, code, discount_percent, expires_at, is_used, used_at, redeemed_appointment_id)
      VALUES ($1, 'CANCEL20', 20, NOW() + INTERVAL '1 day', true, NOW(), $2)`, [patientId, appointmentId]);
    await database.getRepository(AppointmentEntity).update(appointmentId, { voucherCode: 'CANCEL20' });

    await service.cancelPending(appointmentId, patientId);
    await expect(service.cancelPending(appointmentId, patientId)).resolves.toMatchObject({ appointmentStatus: AppointmentStatus.CANCELLED });
    expect((await database.getRepository(DoctorScheduleEntity).findOneByOrFail({ id: original.scheduleId })).status).toBe(SlotStatus.AVAILABLE);
    expect(await redis.get(lockKey)).toBeNull();
    expect(await redis.get(metadataKey)).toBeNull();
    const [voucher] = await database.query('SELECT is_used, redeemed_appointment_id FROM vouchers WHERE code = $1', ['CANCEL20']);
    expect(voucher).toEqual({ is_used: false, redeemed_appointment_id: null });
    expect((await database.getRepository(PaymentTransactionEntity).findOneByOrFail({ id: transaction.id })).status).toBe(PaymentTransactionStatus.SUPERSEDED);
    await expect(finalizer.finalize(verified(transaction, 'SUCCESS'))).resolves.toBe('LATE_SUCCESS');
    await expect(finalizer.finalize(verified(transaction, 'SUCCESS'))).resolves.toBe('ALREADY_FINALIZED');
    const cancelled = await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId });
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
    expect(cancelled.paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
    expect(await database.getRepository(RefundRequestEntity).countBy({ paymentTransactionId: transaction.id })).toBe(1);
  });

  it('rejects another patient cancellation and refuses cancellation after successful payment', async () => {
    const appointmentId = await appointment();
    await service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    await expect(service.cancelPending(appointmentId, otherPatientId)).rejects.toBeInstanceOf(ForbiddenException);
    const transaction = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({ appointmentId });
    await finalizer.finalize(verified(transaction, 'SUCCESS'));
    await expect(service.cancelPending(appointmentId, patientId)).rejects.toBeInstanceOf(ConflictException);
    expect((await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId })).status).toBe(AppointmentStatus.CONFIRMED);
  });

  it('never deletes a replacement Redis reservation when cancelling the old checkout', async () => {
    const appointmentId = await appointment();
    const original = await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId });
    const lockKey = BookingService.formatSlotLockKey(doctorId, original.scheduleId);
    const replacement = randomUUID();
    await redis.set(lockKey, replacement, 'EX', 30);
    try {
      await service.cancelPending(appointmentId, patientId);
      expect(await redis.get(lockKey)).toBe(replacement);
    } finally {
      await new RedisService(redis).releaseLockIfOwner(lockKey, replacement);
    }
  });

  it('serializes callback and user cancellation without deadlock or re-confirming cancelled appointments', async () => {
    const appointmentId = await appointment();
    await service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1');
    const transaction = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({ appointmentId });
    const outcomes = await Promise.allSettled([service.cancelPending(appointmentId, patientId), finalizer.finalize(verified(transaction, 'SUCCESS'))]);
    expect(outcomes[1].status).toBe('fulfilled');
    if (outcomes[0].status === 'rejected') expect(outcomes[0].reason).toBeInstanceOf(ConflictException);
    const current = await database.getRepository(AppointmentEntity).findOneByOrFail({ id: appointmentId });
    const payment = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({ id: transaction.id });
    if (current.status === AppointmentStatus.CANCELLED) {
      expect(current.paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
      expect(payment.status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    } else {
      expect(current.status).toBe(AppointmentStatus.CONFIRMED);
      expect(current.paymentStatus).toBe(PaymentStatus.PAID);
      expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
    }
  });

  it('allows only one active transaction for concurrent initiations', async () => {
    const appointmentId = await appointment();
    const results = await Promise.allSettled([
      service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1'),
      service.initiate(appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictException),
    });
    expect(await database.getRepository(PaymentTransactionEntity).countBy({ appointmentId })).toBe(1);
  });

  it('returns the same logical transaction for the same patient idempotency key', async () => {
    const appointmentId = await appointment();
    const key = randomUUID();
    const first = await service.initiate(
      appointmentId, patientId, key, { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const retry = await service.initiate(
      appointmentId, patientId, key, { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );

    expect(retry.transactionId).toBe(first.transactionId);
    expect(await database.getRepository(PaymentTransactionEntity).countBy({ appointmentId })).toBe(1);
  });

  it('rejects reuse of an idempotency key for another appointment', async () => {
    const key = randomUUID();
    await service.initiate(
      await appointment(), patientId, key, { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );

    await expect(service.initiate(
      await appointment(), patientId, key, { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects payment initiation by a different patient', async () => {
    const appointmentId = await appointment();
    await expect(service.initiate(
      appointmentId, otherPatientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(await database.getRepository(PaymentTransactionEntity).countBy({ appointmentId })).toBe(0);
  });

  it('does not insert a transaction while payment is disabled', async () => {
    const appointmentId = await appointment();
    const disabled = createService({
      ensureEnabled: () => {
        throw new ServiceUnavailableException('Online payment is temporarily disabled.');
      },
    });

    await expect(disabled.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    )).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await database.getRepository(PaymentTransactionEntity).countBy({ appointmentId })).toBe(0);
  });

  it('persists ambiguous provider failures for reconciliation', async () => {
    const appointmentId = await appointment();
    provider.initiate.mockRejectedValueOnce(new PaymentProviderError(
      PaymentProviderErrorKind.TRANSIENT,
      'provider timeout',
    ));

    await expect(service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    )).rejects.toThrow('provider timeout');

    const transaction = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({
      appointmentId,
    });
    expect(transaction.status).toBe(PaymentTransactionStatus.RECONCILIATION_REQUIRED);
    expect(transaction.nextReconcileAt).not.toBeNull();
  });

  it('marks definitive provider rejection failed instead of leaving it active', async () => {
    const appointmentId = await appointment();
    provider.initiate.mockRejectedValueOnce(new PaymentProviderError(
      PaymentProviderErrorKind.REJECTED,
      'provider rejected request',
    ));

    await expect(service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    )).rejects.toThrow('provider rejected request');

    const transaction = await database.getRepository(PaymentTransactionEntity).findOneByOrFail({
      appointmentId,
    });
    expect(transaction.status).toBe(PaymentTransactionStatus.FAILED);
    expect(transaction.nextReconcileAt).toBeNull();
  });

  it.each([PaymentMethod.VNPAY, PaymentMethod.MOMO] as const)(
    'makes duplicate %s callbacks replay-safe',
    async (method: PaymentMethod.VNPAY | PaymentMethod.MOMO) => {
      const appointmentId = await appointment();
      await service.initiate(
        appointmentId,
        patientId,
        randomUUID(),
        { provider: method },
        '127.0.0.1',
      );
      const transaction = await database.getRepository(PaymentTransactionEntity)
        .findOneByOrFail({ appointmentId });

      await expect(finalizer.finalize(verified(transaction, 'SUCCESS'))).resolves.toBe('SUCCESS');
      await expect(finalizer.finalize(verified(transaction, 'SUCCESS'))).resolves.toBe(
        'ALREADY_FINALIZED',
      );
      const paid = await database.getRepository(AppointmentEntity).findOneByOrFail({
        id: appointmentId,
      });
      expect(paid.status).toBe(AppointmentStatus.CONFIRMED);
      expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
      expect(paid.canonicalPaymentTransactionId).toBe(transaction.id);
    },
  );

  it('rejects amount tampering without changing payment state', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const transaction = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ appointmentId });

    await expect(finalizer.finalize(
      verified(transaction, 'SUCCESS', 'TAMPERED', Number(transaction.amountVnd) + 1),
    )).rejects.toBeInstanceOf(BadRequestException);
    const unchanged = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ id: transaction.id });
    expect(unchanged.status).toBe(PaymentTransactionStatus.PENDING);
  });

  it('supersedes an old provider only after an explicit provider switch', async () => {
    const appointmentId = await appointment();
    const first = await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const second = await service.initiate(
      appointmentId,
      patientId,
      randomUUID(),
      { provider: PaymentMethod.MOMO, supersedeActive: true },
      '127.0.0.1',
    );

    const transactions = await database.getRepository(PaymentTransactionEntity).find({
      where: { appointmentId },
      order: { createdAt: 'ASC' },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions.find((item) => item.id === first.transactionId)?.status)
      .toBe(PaymentTransactionStatus.SUPERSEDED);
    expect(transactions.find((item) => item.id === second.transactionId)?.status)
      .toBe(PaymentTransactionStatus.PENDING);
  });

  it('turns success after timeout into one late-payment refund request', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const transaction = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ appointmentId });
    await database.getRepository(AppointmentEntity).update(appointmentId, { reservationExpiresAt: new Date(Date.now() - 1_000) });
    await finalizer.expireReservationForReconciliation(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
    );

    await expect(finalizer.finalize(verified(transaction, 'SUCCESS'))).resolves.toBe('LATE_SUCCESS');
    await expect(finalizer.finalize(verified(transaction, 'SUCCESS'))).resolves.toBe(
      'ALREADY_FINALIZED',
    );
    expect(await database.getRepository(RefundRequestEntity).countBy({
      paymentTransactionId: transaction.id,
    })).toBe(1);
    const expired = await database.getRepository(AppointmentEntity).findOneByOrFail({
      id: appointmentId,
    });
    expect(expired.status).toBe(AppointmentStatus.CANCELLED);
    expect(expired.paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
  });

  it('moves a bounded reconciliation retry sequence to manual review', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const transaction = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ appointmentId });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await finalizer.scheduleReconciliationRetry(
        PaymentMethod.VNPAY,
        transaction.merchantTransactionId,
        'provider unavailable',
      );
    }

    const exhausted = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ id: transaction.id });
    expect(exhausted.reconciliationAttempts).toBe(5);
    expect(exhausted.reconciliationManualReview).toBe(true);
    expect(exhausted.nextReconcileAt).toBeNull();
  });

  it('expires an orphan appointment and releases its slot', async () => {
    const appointmentId = await appointment();

    await expect(finalizer.expireOrphanAppointment(
      appointmentId,
      new Date('2100-01-01T00:00:00.000Z'),
    )).resolves.toBe(true);

    const expired = await database.getRepository(AppointmentEntity).findOneByOrFail({
      id: appointmentId,
    });
    expect(expired.status).toBe(AppointmentStatus.CANCELLED);
    expect(expired.paymentStatus).toBe(PaymentStatus.FAILED);
  });

  it('keeps the appointment, slot, and payment active during pre-expiry reconciliation', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const paymentRepository = database.getRepository(PaymentTransactionEntity);
    const transaction = await paymentRepository.findOneByOrFail({ appointmentId });
    transaction.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
    transaction.nextReconcileAt = new Date('2026-09-29T00:00:00.000Z');
    await paymentRepository.save(transaction);
    provider.queryStatus.mockResolvedValueOnce(verified(transaction, 'PENDING'));

    await createReconciliationService().reconcileExpired(new Date('2026-09-29T00:01:00.000Z'));

    const unchangedAppointment = await database.getRepository(AppointmentEntity)
      .findOneByOrFail({ id: appointmentId });
    const unchangedSchedule = await database.getRepository(DoctorScheduleEntity)
      .findOneByOrFail({ id: unchangedAppointment.scheduleId });
    const unchangedPayment = await paymentRepository.findOneByOrFail({ id: transaction.id });
    expect(unchangedAppointment.status).toBe(AppointmentStatus.PENDING_PAYMENT);
    expect(unchangedSchedule.status).toBe(SlotStatus.HOLDING);
    expect(unchangedPayment.status).toBe(PaymentTransactionStatus.RECONCILIATION_REQUIRED);
  });

  it.each([
    PaymentTransactionStatus.FAILED,
    PaymentTransactionStatus.LATE_SUCCESS,
    PaymentTransactionStatus.SUPERSEDED,
  ])('does not revive terminal payment state %s during a scheduled retry', async (status) => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const repository = database.getRepository(PaymentTransactionEntity);
    const transaction = await repository.findOneByOrFail({ appointmentId });
    transaction.status = status;
    await repository.save(transaction);

    await finalizer.scheduleReconciliationRetry(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
      'stale provider query',
    );

    const unchanged = await repository.findOneByOrFail({ id: transaction.id });
    expect(unchanged.status).toBe(status);
    expect(unchanged.reconciliationAttempts).toBe(0);
  });

  it('converges concurrent callback and reconciliation success to one paid state', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const repository = database.getRepository(PaymentTransactionEntity);
    const transaction = await repository.findOneByOrFail({ appointmentId });
    transaction.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
    transaction.nextReconcileAt = new Date('2026-09-29T00:00:00.000Z');
    await repository.save(transaction);
    const success = verified(transaction, 'SUCCESS');
    provider.queryStatus.mockResolvedValueOnce(success);

    await Promise.all([
      createReconciliationService().reconcileExpired(new Date('2026-09-29T00:01:00.000Z')),
      finalizer.finalize(success),
    ]);

    const paid = await database.getRepository(AppointmentEntity).findOneByOrFail({
      id: appointmentId,
    });
    const persisted = await repository.findOneByOrFail({ id: transaction.id });
    expect(paid.status).toBe(AppointmentStatus.CONFIRMED);
    expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
    expect(persisted.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(await database.getRepository(RefundRequestEntity).countBy({
      paymentTransactionId: transaction.id,
    })).toBe(0);
  });

  it('removes real Redis reservation keys only for the reservation owner', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const booked = await database.getRepository(AppointmentEntity).findOneByOrFail({
      id: appointmentId,
    });
    const transaction = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ appointmentId });
    const lockKey = BookingService.formatSlotLockKey(doctorId, booked.scheduleId);
    const metadataKey = BookingService.formatReservationKey(transaction.reservationId);
    await redis.set(lockKey, transaction.reservationId, 'EX', 60);
    await redis.set(metadataKey, JSON.stringify({ reservationId: transaction.reservationId }), 'EX', 60);

    await finalizer.finalize(verified(transaction, 'SUCCESS'));

    await expect(redis.get(lockKey)).resolves.toBeNull();
    await expect(redis.get(metadataKey)).resolves.toBeNull();
  });

  it('keeps the committed database state when Redis cleanup fails', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const transaction = await database.getRepository(PaymentTransactionEntity)
      .findOneByOrFail({ appointmentId });
    const cleanupFailure = {
      releaseReservationIfOwner: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as unknown as RedisService;
    const isolatedFinalizer = new PaymentFinalizerService(database, cleanupFailure);

    await expect(isolatedFinalizer.finalize(verified(transaction, 'SUCCESS')))
      .resolves.toBe('SUCCESS');

    const paid = await database.getRepository(AppointmentEntity).findOneByOrFail({
      id: appointmentId,
    });
    expect(paid.status).toBe(AppointmentStatus.CONFIRMED);
    expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('rejects a callback whose provider transaction ID changes', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const repository = database.getRepository(PaymentTransactionEntity);
    const transaction = await repository.findOneByOrFail({ appointmentId });
    transaction.providerTransactionId = 'ORIGINAL-PROVIDER-ID';
    await repository.save(transaction);

    await expect(finalizer.finalize(
      verified(transaction, 'SUCCESS', 'DIFFERENT-PROVIDER-ID'),
    )).rejects.toBeInstanceOf(BadRequestException);
    expect((await repository.findOneByOrFail({ id: transaction.id })).status)
      .toBe(PaymentTransactionStatus.PENDING);
  });

  it('persists manual refund reconciliation state and its administrator audit', async () => {
    const adminId = await user('Payment Administrator');
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const repository = database.getRepository(PaymentTransactionEntity);
    const transaction = await repository.findOneByOrFail({ appointmentId });
    transaction.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
    transaction.reconciliationManualReview = true;
    await repository.save(transaction);

    await createReconciliationService().resolveManual(
      transaction.id,
      adminId,
      'MARK_REFUND_REQUIRED',
      'Provider confirmed a late capture during manual review.',
    );

    const resolved = await repository.findOneByOrFail({ id: transaction.id });
    const resolvedAppointment = await database.getRepository(AppointmentEntity)
      .findOneByOrFail({ id: appointmentId });
    const audit = await database.getRepository(PaymentReconciliationAuditEntity)
      .findOneByOrFail({ paymentTransactionId: transaction.id });
    expect(resolved.status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    expect(resolvedAppointment.paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
    expect(audit).toMatchObject({
      adminId,
      action: 'MARK_REFUND_REQUIRED',
      reason: 'Provider confirmed a late capture during manual review.',
      previousStatus: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      newStatus: PaymentTransactionStatus.LATE_SUCCESS,
    });
    expect(await database.getRepository(RefundRequestEntity).countBy({
      paymentTransactionId: transaction.id,
    })).toBe(1);
  });

  it('confirms a payment that succeeds after safe pre-expiry reconciliation', async () => {
    const appointmentId = await appointment();
    await service.initiate(
      appointmentId, patientId, randomUUID(), { provider: PaymentMethod.VNPAY }, '127.0.0.1',
    );
    const repository = database.getRepository(PaymentTransactionEntity);
    const transaction = await repository.findOneByOrFail({ appointmentId });
    transaction.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
    transaction.nextReconcileAt = new Date('2026-09-29T00:00:00.000Z');
    await repository.save(transaction);
    provider.queryStatus.mockResolvedValueOnce(verified(transaction, 'PENDING'));
    const reconciliation = createReconciliationService();
    await reconciliation.reconcileExpired(new Date('2026-09-29T00:01:00.000Z'));
    const pending = await repository.findOneByOrFail({ id: transaction.id });
    pending.nextReconcileAt = new Date('2026-09-29T00:01:30.000Z');
    await repository.save(pending);
    provider.queryStatus.mockResolvedValueOnce(verified(pending, 'SUCCESS'));

    await reconciliation.reconcileExpired(new Date('2026-09-29T00:02:00.000Z'));

    const paid = await database.getRepository(AppointmentEntity).findOneByOrFail({
      id: appointmentId,
    });
    expect(paid.status).toBe(AppointmentStatus.CONFIRMED);
    expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
    expect((await repository.findOneByOrFail({ id: transaction.id })).status)
      .toBe(PaymentTransactionStatus.SUCCESS);
  });
});
