import { DataSource } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentTransactionStatus,
} from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../src/database/entities/payment-trans.entity';
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { PaymentReconciliationService } from '../src/modules/payment/payment-reconciliation.service';
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

  let repository: { find: jest.Mock };
  let appointmentRepository: { find: jest.Mock };
  let finalizer: {
    finalize: jest.Mock;
    expireReservationForReconciliation: jest.Mock;
    expireOrphanAppointment: jest.Mock;
  };
  let vnpay: jest.Mocked<Pick<PaymentProvider, 'queryStatus'>>;
  let momo: jest.Mocked<Pick<PaymentProvider, 'queryStatus'>>;
  let service: PaymentReconciliationService;

  beforeEach(() => {
    repository = { find: jest.fn().mockResolvedValue([transaction]) };
    appointmentRepository = { find: jest.fn().mockResolvedValue([]) };
    const dataSource = {
      isInitialized: true,
      getRepository: jest.fn((entity) =>
        entity === PaymentTransactionEntity ? repository : appointmentRepository,
      ),
    } as unknown as DataSource;
    finalizer = {
      finalize: jest.fn().mockResolvedValue('SUCCESS'),
      expireReservationForReconciliation: jest.fn().mockResolvedValue(undefined),
      expireOrphanAppointment: jest.fn().mockResolvedValue(true),
    };
    vnpay = { queryStatus: jest.fn().mockResolvedValue(result) };
    momo = { queryStatus: jest.fn() };
    service = new PaymentReconciliationService(
      dataSource,
      finalizer as unknown as PaymentFinalizerService,
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
  });

  it('moves to reconciliation and releases the hold when provider query fails', async () => {
    vnpay.queryStatus.mockRejectedValueOnce(new Error('gateway unavailable'));

    await expect(service.reconcileExpired()).resolves.toBe(1);

    expect(finalizer.finalize).not.toHaveBeenCalled();
    expect(finalizer.expireReservationForReconciliation).toHaveBeenCalledWith(
      PaymentMethod.VNPAY,
      transaction.merchantTransactionId,
    );
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
});
