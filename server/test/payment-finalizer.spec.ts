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
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { VerifiedPaymentResult } from '../src/modules/payment/types/verified-payment-result';

describe('PaymentFinalizerService', () => {
  let payment: PaymentTransactionEntity;
  let appointment: AppointmentEntity;
  let schedule: DoctorScheduleEntity;
  let manager: { getRepository: jest.Mock; save: jest.Mock };
  let redis: jest.Mocked<Pick<RedisService, 'releaseLockIfOwner'>>;
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
      sanitizedProviderPayload: null,
      paidAt: null,
    } as PaymentTransactionEntity;
    appointment = {
      id: 'appointment-id',
      doctorId: 'doctor-id',
      scheduleId: 'schedule-id',
      status: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
    } as AppointmentEntity;
    schedule = { id: 'schedule-id', status: SlotStatus.HOLDING } as DoctorScheduleEntity;
    const queryFor = (value: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(value),
      getOneOrFail: jest.fn().mockResolvedValue(value),
    });
    manager = {
      getRepository: jest.fn((entity) => ({
        createQueryBuilder: jest.fn(() =>
          queryFor(
            entity === PaymentTransactionEntity
              ? payment
              : entity === AppointmentEntity
                ? appointment
                : schedule,
          ),
        ),
      })) as never,
      save: jest.fn(async (value) => value),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager as unknown as EntityManager)),
    } as unknown as DataSource;
    redis = { releaseLockIfOwner: jest.fn().mockResolvedValue(true) };
    service = new PaymentFinalizerService(dataSource, redis as unknown as RedisService);
  });

  it('atomically confirms appointment, payment, and slot on verified success', async () => {
    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('SUCCESS');

    expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(payment.signatureVerified).toBe(true);
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(schedule.status).toBe(SlotStatus.BOOKED);
    expect(redis.releaseLockIfOwner).toHaveBeenCalledWith(
      'lock:doctor:doctor-id:slot:schedule-id',
      payment.reservationId,
    );
  });

  it('cancels and releases the slot only for a verified final failure', async () => {
    await expect(service.finalize(verified('FINAL_FAILED'))).resolves.toBe('FAILED');

    expect(payment.status).toBe(PaymentTransactionStatus.FAILED);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(schedule.status).toBe(SlotStatus.AVAILABLE);
    expect(redis.releaseLockIfOwner).toHaveBeenCalled();
  });

  it('keeps the committed success when Redis cleanup fails', async () => {
    redis.releaseLockIfOwner.mockRejectedValueOnce(new Error('Redis unavailable'));

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
    expect(redis.releaseLockIfOwner).not.toHaveBeenCalled();
  });

  it('routes unknown provider states to reconciliation', async () => {
    await expect(service.finalize(verified('UNKNOWN'))).resolves.toBe(
      'RECONCILIATION_REQUIRED',
    );
    expect(payment.status).toBe(PaymentTransactionStatus.RECONCILIATION_REQUIRED);
    expect(redis.releaseLockIfOwner).not.toHaveBeenCalled();
  });

  it('is replay-safe for an already successful transaction', async () => {
    payment.status = PaymentTransactionStatus.SUCCESS;
    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('ALREADY_FINALIZED');
    expect(redis.releaseLockIfOwner).not.toHaveBeenCalled();
  });

  it('marks success after timeout as late success without silently confirming', async () => {
    payment.status = PaymentTransactionStatus.TIMEOUT;
    appointment.status = AppointmentStatus.CANCELLED;
    await expect(service.finalize(verified('SUCCESS'))).resolves.toBe('LATE_SUCCESS');
    expect(payment.status).toBe(PaymentTransactionStatus.LATE_SUCCESS);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(redis.releaseLockIfOwner).not.toHaveBeenCalled();
  });

  it('rejects callback amount tampering before any state transition', async () => {
    await expect(
      service.finalize({ ...verified('SUCCESS'), amountVnd: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(redis.releaseLockIfOwner).not.toHaveBeenCalled();
  });
});
