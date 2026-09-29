import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../src/database/entities/payment-trans.entity';
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { PaymentProvider } from '../src/modules/payment/providers/payment-provider.interface';

describe('PaymentService initiation and status', () => {
  const appointmentId = '552f60d9-a1af-48c7-ad5e-06a707657847';
  const patientId = '0f415e3c-7307-45db-bb18-202bf63d42bf';
  const idempotencyKey = 'a752752f-190f-4307-b229-afb0b7ff609d';
  let appointment: AppointmentEntity;
  let existing: PaymentTransactionEntity | null;
  let active: PaymentTransactionEntity | null;
  let manager: { getRepository: jest.Mock; create: jest.Mock; save: jest.Mock };
  let dataSource: DataSource;
  let vnpay: jest.Mocked<PaymentProvider>;
  let service: PaymentService;

  beforeEach(() => {
    appointment = {
      id: appointmentId,
      patientId,
      doctorId: 'doctor-id',
      scheduleId: 'schedule-id',
      reservationId: '95276349-390f-4ebc-b62b-5c96f60cf899',
      reservationExpiresAt: new Date(Date.now() + 5 * 60_000),
      canonicalPaymentTransactionId: null,
      status: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.VNPAY,
      totalAmount: 300_000,
      paidAt: null,
    } as AppointmentEntity;
    existing = null;
    active = null;
    const appointmentQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => appointment),
    };
    const activeQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => active),
    };
    const paymentRepository = {
      findOne: jest.fn(async () => existing),
      createQueryBuilder: jest.fn(() => activeQuery),
    };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === AppointmentEntity
          ? { createQueryBuilder: () => appointmentQuery }
          : paymentRepository,
      ),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (value) => {
        if ('merchantTransactionId' in value) {
          return { id: 'payment-id', createdAt: new Date(), ...value };
        }
        return value;
      }),
    };
    dataSource = {
      transaction: jest.fn((callback) => callback(manager as unknown as EntityManager)),
      getRepository: jest.fn(),
    } as unknown as DataSource;
    vnpay = {
      initiate: jest.fn(async (context) => ({
        merchantTransactionId: context.merchantTransactionId,
        paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signed=true',
        expiresAt: context.expiresAt,
      })),
      verifyCallback: jest.fn(),
      queryStatus: jest.fn(),
    };
    const momo = { ...vnpay } as jest.Mocked<PaymentProvider>;
    service = new PaymentService(
      dataSource,
      { finalize: jest.fn() } as unknown as PaymentFinalizerService,
      vnpay,
      momo,
    );
  });

  it('creates a pending transaction using only the DB-owned integer amount', async () => {
    const result = await service.initiate(
      appointmentId,
      patientId,
      idempotencyKey,
      { provider: PaymentMethod.VNPAY },
      '127.0.0.1',
    );

    expect(manager.create).toHaveBeenCalledWith(
      PaymentTransactionEntity,
      expect.objectContaining({
        appointmentId,
        patientId,
        reservationId: appointment.reservationId,
        idempotencyKey,
        amountVnd: 300_000,
        expiresAt: appointment.reservationExpiresAt,
        status: PaymentTransactionStatus.PENDING,
      }),
    );
    expect(vnpay.initiate).toHaveBeenCalledWith(
      expect.objectContaining({ amountVnd: 300_000, provider: PaymentMethod.VNPAY }),
    );
    expect(result.transactionId).toBe('payment-id');
  });

  it('returns the same logical transaction for a retry with the same key', async () => {
    existing = {
      id: 'existing-payment',
      appointmentId,
      patientId,
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: 'PAYEXISTING',
      requestId: 'existing-request',
      amountVnd: 300_000,
      status: PaymentTransactionStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
    } as PaymentTransactionEntity;

    const result = await service.initiate(
      appointmentId,
      patientId,
      idempotencyKey,
      { provider: PaymentMethod.MOMO },
      '127.0.0.1',
    );

    expect(result.transactionId).toBe('existing-payment');
    expect(result.provider).toBe(PaymentMethod.VNPAY);
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('does not silently supersede an active transaction for the same provider', async () => {
    active = {
      id: 'active-payment',
      appointmentId,
      provider: PaymentMethod.VNPAY,
      status: PaymentTransactionStatus.PENDING,
    } as PaymentTransactionEntity;

    await expect(
      service.initiate(
        appointmentId,
        patientId,
        idempotencyKey,
        { provider: PaymentMethod.VNPAY },
        '127.0.0.1',
      ),
    ).rejects.toThrow(/active transaction/i);
    expect(active.status).toBe(PaymentTransactionStatus.PENDING);
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('supersedes an active transaction only for an explicitly confirmed provider switch', async () => {
    active = {
      id: 'active-payment',
      appointmentId,
      provider: PaymentMethod.VNPAY,
      status: PaymentTransactionStatus.PENDING,
    } as PaymentTransactionEntity;

    await service.initiate(
      appointmentId,
      patientId,
      idempotencyKey,
      { provider: PaymentMethod.MOMO, supersedeActive: true },
      '127.0.0.1',
    );

    expect(active.status).toBe(PaymentTransactionStatus.SUPERSEDED);
    expect(manager.save).toHaveBeenCalledWith(active);
  });

  it('rejects malformed idempotency keys before touching the database', async () => {
    await expect(
      service.initiate(
        appointmentId,
        patientId,
        'not-a-uuid',
        { provider: PaymentMethod.VNPAY },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects payment initiation for another patient appointment', async () => {
    await expect(
      service.initiate(
        appointmentId,
        'another-patient',
        idempotencyKey,
        { provider: PaymentMethod.VNPAY },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(vnpay.initiate).not.toHaveBeenCalled();
  });

  it('prevents a patient from reading another patient payment state', async () => {
    (dataSource.getRepository as jest.Mock).mockReturnValue({
      findOne: jest.fn().mockResolvedValue(appointment),
    });
    await expect(service.status(appointmentId, 'another-patient')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns the canonical successful transaction instead of a newer late transaction', async () => {
    appointment.status = AppointmentStatus.CONFIRMED;
    appointment.paymentStatus = PaymentStatus.PAID;
    appointment.canonicalPaymentTransactionId = 'canonical-payment';
    const canonical = {
      id: 'canonical-payment',
      appointmentId,
      provider: PaymentMethod.VNPAY,
      status: PaymentTransactionStatus.SUCCESS,
      expiresAt: new Date(),
      paidAt: new Date(),
    } as PaymentTransactionEntity;
    const paymentFindOne = jest.fn().mockResolvedValue(canonical);
    (dataSource.getRepository as jest.Mock).mockImplementation((entity) =>
      entity === AppointmentEntity
        ? { findOne: jest.fn().mockResolvedValue(appointment) }
        : { findOne: paymentFindOne },
    );

    const result = await service.status(appointmentId, patientId);

    expect(paymentFindOne).toHaveBeenCalledWith({
      where: { id: 'canonical-payment', appointmentId },
    });
    expect(result.transactionStatus).toBe(PaymentTransactionStatus.SUCCESS);
  });
});
