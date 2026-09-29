import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  SlotStatus,
} from '@shared/enums';
import { RedisService } from '../src/common/redis/redis.service';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { PaymentTransactionEntity } from '../src/database/entities/payment-trans.entity';
import { RefundRequestEntity } from '../src/database/entities/refund-request.entity';
import { VoucherEntity } from '../src/database/entities/voucher.entity';
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { VerifiedPaymentResult } from '../src/modules/payment/types/verified-payment-result';

describe('PaymentFinalizerService', () => {
  let payment: PaymentTransactionEntity;
  let appointment: AppointmentEntity;
  let schedule: DoctorScheduleEntity;
  let manager: { getRepository: jest.Mock; create: jest.Mock; save: jest.Mock };
  let voucher: VoucherEntity | null;
  let redis: jest.Mocked<Pick<RedisService, 'releaseReservationIfOwner'>>;
  let service: PaymentFinalizerService;

  const verified = (state: VerifiedPaymentResult['state']): VerifiedPaymentResult => ({
    provider: PaymentMethod.VNPAY,
    merchantTransactionId: 'PAY01',
    providerTransactionId: 'VNP01',
    amountVnd: 300_000,
    state,
    responseCode: state === 'SUCCESS' ? '00' : '24',
    rawProviderStatus: state === 'SUCCESS' ? '00' : '24',
    signatureVerified: true,
    sourceValidated: true,
    sanitizedPayload: { vnp_TxnRef: 'PAY01' },
  });

  beforeEach(() => {
    payment = {
      id: 'payment-id',
      appointmentId: 'appointment-id',
      reservationId: '95276349-390f-4ebc-b62b-5c96f60cf899',
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: 'PAY01',
      amountVnd: 300_000,
      status: PaymentTransactionStatus.PENDING,
      providerTransactionId: null,
      responseCode: null,
      providerStatus: null,
      callbackReceivedAt: null,
      signatureVerified: false,
      sourceValidated: false,
      reconciliationAttempts: 0,
      nextReconcileAt: null,
      lastReconcileError: null,
      reconciliationManualReview: false,
      sanitizedProviderPayload: null,
      paidAt: null,
    } as PaymentTransactionEntity;
    appointment = {
      id: 'appointment-id',
      doctorId: 'doctor-id',
      scheduleId: 'schedule-id',
      status: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      canonicalPaymentTransactionId: null,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
    } as AppointmentEntity;
    schedule = { id: 'schedule-id', status: SlotStatus.HOLDING } as DoctorScheduleEntity;
    voucher = null;
    const queryFor = (value: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(value),
      getOneOrFail: jest.fn().mockResolvedValue(value),
    });
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === RefundRequestEntity) {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {
          createQueryBuilder: jest.fn(() =>
            queryFor(
              entity === PaymentTransactionEntity
                ? payment
                : entity === AppointmentEntity
                  ? appointment
                  : entity === VoucherEntity
                    ? voucher
                    : schedule,
            ),
          ),
        };
      }) as never,
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (value) => value),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager as unknown as EntityManager)),
    } as unknown as DataSource;
    redis = { releaseReservationIfOwner: jest.fn().mockResolvedValue(true) };
    service = new PaymentFinalizerService(dataSource, redis as unknown as RedisService);
  });

  it('atomically confirms appointment, payment, and slot on verified success', async () => {
    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('SUCCESS');

    expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(payment.signatureVerified).toBe(true);
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(appointment.canonicalPaymentTransactionId).toBe(payment.id);
    expect(schedule.status).toBe(SlotStatus.BOOKED);
    expect(redis.releaseReservationIfOwner).toHaveBeenCalledWith(
      'lock:doctor:doctor-id:slot:schedule-id',
      `reservation:${payment.reservationId}`,
      payment.reservationId,
    );
  });

  it('cancels and releases the slot only for a verified final failure', async () => {
    await expect(service.finalize(verified('FINAL_FAILED'))).resolves.toBe('FAILED');

    expect(payment.status).toBe(PaymentTransactionStatus.FAILED);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(schedule.status).toBe(SlotStatus.AVAILABLE);
    expect(redis.releaseReservationIfOwner).toHaveBeenCalled();
  });

  it('keeps the committed success when Redis cleanup fails', async () => {
    redis.releaseReservationIfOwner.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('SUCCESS');

    expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(schedule.status).toBe(SlotStatus.BOOKED);
  });

  it('keeps non-final callbacks pending without releasing the reservation', async () => {
    await expect(service.finalize(verified('PENDING'))).resolves.toBe('PENDING');
    expect(payment.status).toBe(PaymentTransactionStatus.PENDING);
    expect(appointment.status).toBe(AppointmentStatus.PENDING_PAYMENT);
    expect(schedule.status).toBe(SlotStatus.HOLDING);
    expect(redis.releaseReservationIfOwner).not.toHaveBeenCalled();
  });

  it('routes unknown provider states to reconciliation', async () => {
    await expect(service.finalize(verified('UNKNOWN'))).resolves.toBe(
      'RECONCILIATION_REQUIRED',
    );
    expect(payment.status).toBe(PaymentTransactionStatus.RECONCILIATION_REQUIRED);
    expect(redis.releaseReservationIfOwner).not.toHaveBeenCalled();
  });

  it('does not let an unknown query overwrite an already successful payment', async () => {
    payment.status = PaymentTransactionStatus.SUCCESS;
    await expect(service.finalize(verified('UNKNOWN'))).resolves.toBe(
      'ALREADY_FINALIZED',
    );
    expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
  });

  it('is replay-safe for an already successful transaction', async () => {
    payment.status = PaymentTransactionStatus.SUCCESS;
    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('ALREADY_FINALIZED');
    expect(redis.releaseReservationIfOwner).not.toHaveBeenCalled();
  });

  it('marks success after timeout as late success without silently confirming', async () => {
    payment.status = PaymentTransactionStatus.TIMEOUT;
    appointment.status = AppointmentStatus.CANCELLED;
    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('LATE_SUCCESS');
    expect(payment.status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
    expect(manager.create).toHaveBeenCalledWith(
      RefundRequestEntity,
      expect.objectContaining({
        paymentTransactionId: payment.id,
        appointmentId: appointment.id,
        amount: 300_000,
        status: 'PENDING',
      }),
    );
    expect(redis.releaseReservationIfOwner).not.toHaveBeenCalled();
  });

  it('keeps the canonical appointment paid when a superseded payment succeeds late', async () => {
    payment.status = PaymentTransactionStatus.SUPERSEDED;
    appointment.status = AppointmentStatus.CONFIRMED;
    appointment.paymentStatus = PaymentStatus.PAID;
    appointment.paidAt = new Date('2026-09-28T10:00:00.000Z');

    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('LATE_SUCCESS');

    expect(payment.status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(appointment.canonicalPaymentTransactionId).toBeNull();
    expect(appointment.paidAt).toEqual(new Date('2026-09-28T10:00:00.000Z'));
    expect(manager.create).toHaveBeenCalledWith(
      RefundRequestEntity,
      expect.objectContaining({ paymentTransactionId: payment.id }),
    );
  });

  it('returns a reserved voucher after final payment failure', async () => {
    appointment.voucherCode = 'SAVE20';
    voucher = {
      id: 'voucher-id',
      code: 'SAVE20',
      isUsed: true,
      usedAt: new Date(),
      redeemedAppointmentId: appointment.id,
    } as VoucherEntity;

    await service.finalize(verified('FINAL_FAILED'));

    expect(voucher.isUsed).toBe(false);
    expect(voucher.usedAt).toBeNull();
    expect(voucher.redeemedAppointmentId).toBeNull();
    expect(manager.save).toHaveBeenCalledWith(voucher);
  });

  it('expires the held slot into reconciliation without claiming payment failure', async () => {
    await service.expireReservationForReconciliation(
      PaymentMethod.VNPAY,
      payment.merchantTransactionId,
    );

    expect(payment.status).toBe(PaymentTransactionStatus.RECONCILIATION_REQUIRED);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(appointment.cancellationReason).toBe('PAYMENT_TIMEOUT');
    expect(appointment.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(schedule.status).toBe(SlotStatus.AVAILABLE);
    expect(redis.releaseReservationIfOwner).toHaveBeenCalledWith(
      'lock:doctor:doctor-id:slot:schedule-id',
      `reservation:${payment.reservationId}`,
      payment.reservationId,
    );
  });

  it('keeps a single consistent state when a verified IPN wins the timeout race', async () => {
    await Promise.all([
      service.finalize(verified('SUCCESS')),
      service.expireReservationForReconciliation(
        PaymentMethod.VNPAY,
        payment.merchantTransactionId,
      ),
    ]);

    expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(schedule.status).toBe(SlotStatus.BOOKED);
  });

  it('routes payment to late-success when timeout wins the IPN race', async () => {
    await service.expireReservationForReconciliation(
      PaymentMethod.VNPAY,
      payment.merchantTransactionId,
    );
    await service.finalize(verified('SUCCESS'));

    expect(payment.status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.REFUND_PENDING);
    expect(schedule.status).toBe(SlotStatus.AVAILABLE);
  });

  it('rejects callback amount tampering before any state transition', async () => {
    await expect(
      service.finalize({ ...verified('SUCCESS'), amountVnd: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(redis.releaseReservationIfOwner).not.toHaveBeenCalled();
  });

  it('rejects a signed MoMo callback with a mismatched request ID', async () => {
    payment.provider = PaymentMethod.MOMO;
    payment.requestId = 'original-request';

    await expect(
      service.finalize({
        ...verified('SUCCESS'),
        provider: PaymentMethod.MOMO,
        requestId: 'another-request',
      }),
    ).rejects.toThrow('MoMo requestId mismatch.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('keeps provider transaction identity immutable across replays', async () => {
    payment.providerTransactionId = 'VNP-ORIGINAL';

    await expect(
      service.finalize({
        ...verified('SUCCESS'),
        providerTransactionId: 'VNP-CONFLICT',
      }),
    ).rejects.toThrow('Provider transaction ID mismatch.');
    expect(payment.providerTransactionId).toBe('VNP-ORIGINAL');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('stops automatic reconciliation after the bounded retry threshold', async () => {
    payment.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
    payment.reconciliationAttempts = 4;

    await service.scheduleReconciliationRetry(
      PaymentMethod.VNPAY,
      payment.merchantTransactionId,
      'gateway unavailable',
      new Date('2026-09-28T10:00:00.000Z'),
    );

    expect(payment.reconciliationAttempts).toBe(5);
    expect(payment.reconciliationManualReview).toBe(true);
    expect(payment.nextReconcileAt).toBeNull();
    expect(payment.lastReconcileError).toBe('gateway unavailable');
  });

  it.each([
    PaymentTransactionStatus.FAILED,
    PaymentTransactionStatus.TIMEOUT,
    PaymentTransactionStatus.SUPERSEDED,
    PaymentTransactionStatus.LATE_SUCCESS,
    PaymentTransactionStatus.SUCCESS,
  ])('never revives terminal state %s for another reconciliation retry', async (status) => {
    payment.status = status;

    await service.scheduleReconciliationRetry(
      PaymentMethod.VNPAY,
      payment.merchantTransactionId,
      'stale worker error',
    );

    expect(payment.status).toBe(status);
    expect(payment.reconciliationAttempts).toBe(0);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
