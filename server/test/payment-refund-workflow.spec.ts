import { DataSource, EntityManager } from 'typeorm';
import { AppointmentStatus, PaymentMethod, PaymentStatus } from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { RefundRequestEntity } from '../src/database/entities/refund-request.entity';
import { PaymentTransactionEntity } from '../src/database/entities/payment-trans.entity';
import { PaymentFinalizerService } from '../src/modules/payment/payment-finalizer.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { PaymentProvider } from '../src/modules/payment/providers/payment-provider.interface';

describe('Payment manual refund workflow', () => {
  const refundId = '11111111-1111-4111-8111-111111111111';
  const adminId = '22222222-2222-4222-8222-222222222222';
  let appointment: AppointmentEntity;
  let refund: RefundRequestEntity;
  let manager: { getRepository: jest.Mock; save: jest.Mock };
  let service: PaymentService;

  beforeEach(() => {
    appointment = {
      id: 'appointment-id',
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      canonicalPaymentTransactionId: 'canonical-payment',
    } as AppointmentEntity;
    refund = {
      id: refundId,
      appointmentId: appointment.id,
      paymentTransactionId: 'duplicate-late-payment',
      provider: PaymentMethod.VNPAY,
      amount: 300_000,
      status: 'PENDING',
      attempts: 0,
      failureReason: null,
      processedAt: null,
      providerRefundId: null,
      processedBy: null,
    } as RefundRequestEntity;
    const locked = (value: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(value),
    });
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === RefundRequestEntity) {
          return {
              findOne: jest.fn().mockResolvedValue(refund),
              createQueryBuilder: jest.fn(() => locked(refund)),
          };
        }
        if (entity === PaymentTransactionEntity) {
          return {
            findOneBy: jest.fn().mockResolvedValue({
              id: refund.paymentTransactionId,
              status: 'LATE_SUCCESS',
            }),
          };
        }
        return { createQueryBuilder: jest.fn(() => locked(appointment)) };
      }),
      save: jest.fn(async (value) => value),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager as unknown as EntityManager)),
    } as unknown as DataSource;
    const provider = {} as PaymentProvider;
    service = new PaymentService(
      dataSource,
      {} as PaymentFinalizerService,
      provider,
      provider,
    );
  });

  it('records a duplicate-payment refund without changing the canonical paid state', async () => {
    const result = await service.resolveRefund(refundId, adminId, {
      outcome: 'SUCCEEDED',
      providerRefundId: 'VNP-REFUND-01',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.providerRefundId).toBe('VNP-REFUND-01');
    expect(result.processedBy).toBe(adminId);
    expect(appointment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(manager.save).not.toHaveBeenCalledWith(appointment);
  });

  it('marks the appointment refunded when its canonical payment is refunded', async () => {
    refund.paymentTransactionId = appointment.canonicalPaymentTransactionId;

    await service.resolveRefund(refundId, adminId, {
      outcome: 'SUCCEEDED',
      providerRefundId: 'VNP-REFUND-02',
    });

    expect(appointment.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(manager.save).toHaveBeenCalledWith(appointment);
  });

  it('closes refund pending after the only late-success payment is refunded', async () => {
    appointment.status = AppointmentStatus.CANCELLED;
    appointment.paymentStatus = PaymentStatus.REFUND_PENDING;
    appointment.canonicalPaymentTransactionId = null;

    await service.resolveRefund(refundId, adminId, {
      outcome: 'SUCCEEDED',
      providerRefundId: 'VNP-REFUND-LATE',
    });

    expect(appointment.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(manager.save).toHaveBeenCalledWith(appointment);
  });
});
