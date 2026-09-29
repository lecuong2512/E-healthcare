import { DataSource } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentTransactionStatus,
} from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../src/database/entities/payment-trans.entity';
import { PaymentReconciliationAuditEntity } from '../src/database/entities/payment-reconciliation-audit.entity';
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { PaymentReconciliationService } from '../src/modules/payment/payment-reconciliation.service';
import { PaymentConfiguration } from '../src/modules/payment/payment-config';
import { PaymentProvider } from '../src/modules/payment/providers/payment-provider.interface';
import { VerifiedPaymentResult } from '../src/modules/payment/types/verified-payment-result';

describe('PaymentReconciliationService', () => {
  const transaction = {
    id: 'payment-id',
    provider: PaymentMethod.VNPAY,
    merchantTransactionId: 'PAY01',
    amountVnd: 300_000,
    status: PaymentTransactionStatus.PENDING,
    expiresAt: new Date('2026-09-28T10:00:00.000Z'),
  } as PaymentTransactionEntity;
  const result: VerifiedPaymentResult = {
    provider: PaymentMethod.VNPAY,
    merchantTransactionId: transaction.merchantTransactionId,
    amountVnd: 300_000,
    state: 'SUCCESS',
    responseCode: '00',
    signatureVerified: true,
    sourceValidated: true,
    sanitizedPayload: {},
  };

  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneByOrFail: jest.Mock;
    update: jest.Mock;
  };
  let appointmentRepository: { find: jest.Mock };
  let auditRepository: { create: jest.Mock; save: jest.Mock };
  let lockedPayment: PaymentTransactionEntity;
  let managerSave: jest.Mock;
  let finalizer: {
    finalize: jest.Mock;
    expireReservationForReconciliation: jest.Mock;
    expireOrphanAppointment: jest.Mock;
    scheduleReconciliationRetry: jest.Mock;
  };
  let vnpay: jest.Mocked<Pick<PaymentProvider, 'queryStatus'>>;
  let momo: jest.Mocked<Pick<PaymentProvider, 'queryStatus'>>;
  let service: PaymentReconciliationService;
  let dataSource: DataSource;
  let lockRunner: { connect: jest.Mock; query: jest.Mock; release: jest.Mock };
  let configuration: jest.Mocked<Pick<PaymentConfiguration, 'isEnabled' | 'ensureEnabled'>>;

  beforeEach(() => {
    repository = {
      find: jest.fn().mockResolvedValue([transaction]),
      findOne: jest.fn().mockResolvedValue(transaction),
      findOneByOrFail: jest.fn().mockResolvedValue(transaction),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    appointmentRepository = { find: jest.fn().mockResolvedValue([]) };
    auditRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    lockedPayment = transaction;
    managerSave = jest.fn(async (value) => value);
    lockRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      isInitialized: true,
      getRepository: jest.fn((entity) =>
        entity === PaymentTransactionEntity
          ? repository
          : entity === PaymentReconciliationAuditEntity
            ? auditRepository
            : appointmentRepository,
      ),
      createQueryRunner: jest.fn(() => lockRunner),
      transaction: jest.fn(async (callback) => callback({
        getRepository: (entity: unknown) => {
          if (entity === PaymentReconciliationAuditEntity) return auditRepository;
          if (entity === PaymentTransactionEntity) {
            return {
              createQueryBuilder: () => ({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(lockedPayment),
              }),
            };
          }
          return appointmentRepository;
        },
        save: managerSave,
      })),
    } as unknown as DataSource;
    finalizer = {
      finalize: jest.fn().mockResolvedValue('SUCCESS'),
      expireReservationForReconciliation: jest.fn().mockResolvedValue(undefined),
      expireOrphanAppointment: jest.fn().mockResolvedValue(true),
      scheduleReconciliationRetry: jest.fn().mockResolvedValue(undefined),
    };
    vnpay = { queryStatus: jest.fn().mockResolvedValue(result) };
    momo = { queryStatus: jest.fn() };
    configuration = {
      isEnabled: jest.fn().mockReturnValue(true),
      ensureEnabled: jest.fn(),
    };
    service = new PaymentReconciliationService(
      dataSource,
      finalizer as unknown as PaymentFinalizerService,
      configuration as unknown as PaymentConfiguration,
      vnpay as unknown as PaymentProvider,
      momo as unknown as PaymentProvider,
    );
  });

  it('queries an expired transaction and finalizes provider success', async () => {
    await expect(service.reconcileExpired()).resolves.toBe(1);
    expect(vnpay.queryStatus).toHaveBeenCalledWith(transaction);
    expect(finalizer.finalize).toHaveBeenCalledWith(result);
    expect(finalizer.expireReservationForReconciliation).not.toHaveBeenCalled();
  });

  it('expires the booking hold when the provider remains pending', async () => {
    finalizer.finalize.mockResolvedValueOnce('PENDING');
    vnpay.queryStatus.mockResolvedValueOnce({ ...result, state: 'PENDING' });

    await service.reconcileExpired();

    expect(finalizer.expireReservationForReconciliation).toHaveBeenCalledWith(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
    );
    expect(finalizer.scheduleReconciliationRetry).toHaveBeenCalledWith(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
      'Provider returned PENDING',
      expect.any(Date),
    );
  });

  it('moves to reconciliation and releases the hold when provider query fails', async () => {
    vnpay.queryStatus.mockRejectedValueOnce(new Error('gateway unavailable'));

    await expect(service.reconcileExpired()).resolves.toBe(1);

    expect(finalizer.finalize).not.toHaveBeenCalled();
    expect(finalizer.expireReservationForReconciliation).toHaveBeenCalledWith(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
    );
    expect(finalizer.scheduleReconciliationRetry).toHaveBeenCalledWith(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
      'gateway unavailable',
      expect.any(Date),
    );
  });

  it('retries a due reconciliation transaction and accepts a later success', async () => {
    const retry = {
      ...transaction,
      status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      reconciliationAttempts: 1,
      nextReconcileAt: new Date('2026-09-28T09:59:00.000Z'),
      reconciliationManualReview: false,
    } as PaymentTransactionEntity;
    repository.find.mockResolvedValueOnce([retry]);
    finalizer.finalize.mockResolvedValueOnce('LATE_SUCCESS');

    await expect(
      service.reconcileExpired(new Date('2026-09-28T10:00:00.000Z')),
    ).resolves.toBe(1);

    expect(vnpay.queryStatus).toHaveBeenCalledWith(retry);
    expect(finalizer.finalize).toHaveBeenCalledWith(result);
    expect(finalizer.scheduleReconciliationRetry).not.toHaveBeenCalled();
  });

  it('expires a pending appointment that never received a payment transaction', async () => {
    repository.find.mockResolvedValueOnce([]);
    appointmentRepository.find.mockResolvedValueOnce([
      {
        id: 'orphan-appointment',
        status: AppointmentStatus.PENDING_PAYMENT,
        reservationExpiresAt: new Date('2026-09-28T09:59:00.000Z'),
      },
    ]);

    await expect(
      service.reconcileExpired(new Date('2026-09-28T10:00:00.000Z')),
    ).resolves.toBe(1);
    expect(finalizer.expireOrphanAppointment).toHaveBeenCalledWith(
      'orphan-appointment',
      new Date('2026-09-28T10:00:00.000Z'),
    );
  });

  it('does nothing while a previous scheduler run is active', async () => {
    let resolveQuery!: (value: VerifiedPaymentResult) => void;
    vnpay.queryStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );
    const first = service.reconcileExpired();

    await expect(service.reconcileExpired()).resolves.toBe(0);
    resolveQuery(result);
    await expect(first).resolves.toBe(1);
  });

  it('keeps the booking hold when reconciliation runs before reservation expiry', async () => {
    const beforeExpiry = {
      ...transaction,
      status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      expiresAt: new Date('2026-09-28T10:10:00.000Z'),
      nextReconcileAt: new Date('2026-09-28T09:59:00.000Z'),
      reconciliationManualReview: false,
    } as PaymentTransactionEntity;
    repository.find.mockResolvedValueOnce([beforeExpiry]);
    finalizer.finalize.mockResolvedValueOnce('PENDING');
    vnpay.queryStatus.mockResolvedValueOnce({ ...result, state: 'PENDING' });

    await service.reconcileExpired(new Date('2026-09-28T10:00:00.000Z'));

    expect(finalizer.expireReservationForReconciliation).not.toHaveBeenCalled();
    expect(finalizer.scheduleReconciliationRetry).toHaveBeenCalled();
  });

  it('does not acquire a lock or query providers while payments are disabled', async () => {
    configuration.isEnabled.mockReturnValueOnce(false);

    await expect(service.reconcileExpired()).resolves.toBe(0);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(vnpay.queryStatus).not.toHaveBeenCalled();
  });

  it('lists only the safe manual-review projection', async () => {
    repository.find.mockResolvedValueOnce([{
      ...transaction,
      appointmentId: 'appointment-id',
      reconciliationAttempts: 5,
      lastReconcileError: 'timeout',
      createdAt: new Date('2026-09-28T09:00:00.000Z'),
    }]);

    const result = await service.manualReviewTransactions();

    expect(result).toEqual([expect.objectContaining({
      transactionId: 'payment-id',
      appointmentId: 'appointment-id',
      amountVnd: 300_000,
      reconciliationAttempts: 5,
    })]);
    expect(result[0]).not.toHaveProperty('idempotencyKey');
    expect(result[0]).not.toHaveProperty('sanitizedProviderPayload');
  });

  it('allows an administrator to re-query a manual-review transaction', async () => {
    const manual = {
      ...transaction,
      status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      reconciliationManualReview: true,
    } as PaymentTransactionEntity;
    repository.findOne.mockResolvedValueOnce(manual);
    repository.findOneByOrFail.mockResolvedValueOnce(manual);

    await service.manualReconcile('payment-id', 'admin-id');

    expect(configuration.ensureEnabled).toHaveBeenCalled();
    expect(vnpay.queryStatus).toHaveBeenCalledWith(manual);
    expect(finalizer.finalize).toHaveBeenCalledWith(result);
    expect(auditRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'RETRY_PROVIDER_QUERY',
      adminId: 'admin-id',
    }));
  });

  it('marks a manual-review transaction failed without allowing arbitrary paid state', async () => {
    const manual = {
      ...transaction,
      status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      reconciliationManualReview: true,
    } as PaymentTransactionEntity;
    lockedPayment = manual;
    repository.findOne.mockResolvedValueOnce(manual);

    await service.resolveManual('payment-id', 'admin-id', 'MARK_FAILED');

    expect(finalizer.expireReservationForReconciliation).toHaveBeenCalled();
    expect(lockedPayment.status).toBe(PaymentTransactionStatus.FAILED);
    expect(lockedPayment.reconciliationManualReview).toBe(false);
    expect(managerSave).toHaveBeenCalledWith(lockedPayment);
    expect(auditRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'MARK_FAILED',
      previousStatus: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      newStatus: PaymentTransactionStatus.FAILED,
    }));
  });

  it('requires a durable reason before marking a refund as required', async () => {
    await expect(
      service.resolveManual('payment-id', 'admin-id', 'MARK_REFUND_REQUIRED'),
    ).rejects.toThrow('A reason is required');
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('allows only one reconciliation leader across service instances', async () => {
    let resolveQuery!: (value: VerifiedPaymentResult) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    vnpay.queryStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
          markStarted();
        }),
    );
    const rejectedRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ acquired: false }]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    (dataSource.createQueryRunner as jest.Mock)
      .mockReturnValueOnce(lockRunner)
      .mockReturnValueOnce(rejectedRunner);
    const secondService = new PaymentReconciliationService(
      dataSource,
      finalizer as unknown as PaymentFinalizerService,
      configuration as unknown as PaymentConfiguration,
      vnpay as unknown as PaymentProvider,
      momo as unknown as PaymentProvider,
    );

    const first = service.reconcileExpired();
    await started;
    await expect(secondService.reconcileExpired()).resolves.toBe(0);
    expect(vnpay.queryStatus).toHaveBeenCalledTimes(1);

    resolveQuery(result);
    await expect(first).resolves.toBe(1);
    expect(rejectedRunner.release).toHaveBeenCalled();
  });
});
