import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@shared/enums';
import {
  InitiatePaymentResponse,
  CancelPendingPaymentResponse,
  PaymentStatusResponse,
} from '@shared/interfaces';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../../database/entities/payment-trans.entity';
import { RefundRequestEntity } from '../../database/entities/refund-request.entity';
import { InitiatePaymentDto, ResolveRefundDto } from './dto';
import {
  MOMO_PROVIDER,
  VNPAY_PROVIDER,
} from './constants/payment.constants';
import { PaymentFinalizerService, PaymentFinalizeOutcome } from './payment-finalizer.service';
import { PaymentProvider } from './providers/payment-provider.interface';
import { PaymentConfiguration } from './payment-config';
import { PaymentProviderError } from './providers/payment-provider.error';
import { permitsClinicFallback } from './payment-recovery.policy';

@Injectable()
export class PaymentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly finalizer: PaymentFinalizerService,
    private readonly configuration: PaymentConfiguration,
    @Inject(VNPAY_PROVIDER) private readonly vnpay: PaymentProvider,
    @Inject(MOMO_PROVIDER) private readonly momo: PaymentProvider,
  ) {}

  async initiate(
    identifier: string,
    patientId: string,
    idempotencyKey: string,
    dto: InitiatePaymentDto,
    clientIp: string,
  ): Promise<InitiatePaymentResponse> {
    this.configuration.ensureEnabled();
    if (!this.isUuid(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key phải là UUID hợp lệ.');
    }
    const transaction = await this.dataSource.transaction(async (manager) => {
      const appointmentId = await this.resolveAppointmentId(identifier, manager);
      const appointment = await manager
        .getRepository(AppointmentEntity)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.id = :appointmentId', { appointmentId })
        .getOne();
      if (!appointment) throw new NotFoundException('Appointment not found.');
      if (appointment.patientId !== patientId) {
        throw new ForbiddenException('Bạn không có quyền thanh toán lịch hẹn này.');
      }
      if ([PaymentStatus.PAID, PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED].includes(appointment.paymentStatus)) {
        throw new ConflictException('Checkout already recorded funds. Do not pay again.');
      }

      const paymentRepository = manager.getRepository(PaymentTransactionEntity);
      const idempotent = await paymentRepository.findOne({
        where: { patientId, idempotencyKey },
      });
      if (idempotent) {
        if (idempotent.appointmentId !== appointmentId) {
          throw new ConflictException('Idempotency-Key đã được dùng cho lịch hẹn khác.');
        }
        if (idempotent.provider !== dto.provider) {
          throw new ConflictException('Idempotency-Key belongs to a different provider.');
        }
        if (appointment.status !== AppointmentStatus.PENDING_PAYMENT ||
          !appointment.reservationExpiresAt || appointment.reservationExpiresAt.getTime() <= Date.now()) {
          throw new ConflictException('Checkout is no longer payable.');
        }
        if (idempotent.status !== PaymentTransactionStatus.PENDING) {
          throw new ConflictException('Giao dịch với Idempotency-Key này đã kết thúc.');
        }
        return idempotent;
      }

      if (appointment.status !== AppointmentStatus.PENDING_PAYMENT) {
        throw new ConflictException('Lịch hẹn không ở trạng thái chờ thanh toán.');
      }
      if (!appointment.reservationId) {
        throw new ConflictException('Lịch hẹn không có reservation hợp lệ.');
      }
      if (
        !appointment.reservationExpiresAt ||
        appointment.reservationExpiresAt.getTime() <= Date.now()
      ) {
        throw new ConflictException({ code: 'RESERVATION_EXPIRED', message: 'Ca khám đã hết hạn thanh toán.' });
      }
      const amountVnd = Number(appointment.totalAmount);
      if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
        throw new BadRequestException('Số tiền lịch hẹn không phải integer VND hợp lệ.');
      }

      const active = await paymentRepository
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.appointment_id = :appointmentId', { appointmentId })
        .andWhere('payment.status IN (:...statuses)', {
          statuses: [
            PaymentTransactionStatus.PENDING,
            PaymentTransactionStatus.RECONCILIATION_REQUIRED,
          ],
        })
        .getOne();
      if (active) {
        if (active.status === PaymentTransactionStatus.RECONCILIATION_REQUIRED) {
          throw new ConflictException({ code: 'PAYMENT_RECONCILIATION_REQUIRED', message: 'Payment is being reconciled. Do not pay again.' });
        }
        if (active.provider === dto.provider) {
          throw new ConflictException(
            'An active transaction already exists for this payment provider.',
          );
        }
        if (dto.supersedeActive !== true) {
          throw new ConflictException(
            'Explicit confirmation is required to switch payment provider.',
          );
        }
        active.status = PaymentTransactionStatus.SUPERSEDED;
        await manager.save(active);
      }

      appointment.paymentMethod = dto.provider;
      await manager.save(appointment);
      return manager.save(
        manager.create(PaymentTransactionEntity, {
          appointmentId,
          reservationId: appointment.reservationId,
          patientId,
          provider: dto.provider,
          merchantTransactionId: this.merchantTransactionId(),
          providerTransactionId: null,
          requestId: randomUUID(),
          idempotencyKey,
          amountVnd,
          currency: 'VND',
          status: PaymentTransactionStatus.PENDING,
          responseCode: null,
          providerStatus: null,
          expiresAt: appointment.reservationExpiresAt,
          paidAt: null,
          callbackReceivedAt: null,
          signatureVerified: false,
          sourceValidated: false,
          reconciliationAttempts: 0,
          nextReconcileAt: null,
          lastReconcileError: null,
          reconciliationManualReview: false,
          sanitizedProviderPayload: null,
        }),
      );
    });

    const provider = this.provider(transaction.provider);
    let result;
    try {
      result = await provider.initiate({
        provider: transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
        merchantTransactionId: transaction.merchantTransactionId,
        requestId: transaction.requestId || transaction.merchantTransactionId,
        amountVnd: Number(transaction.amountVnd),
        clientIp: this.normalizeIp(clientIp),
        createdAt: transaction.createdAt,
        expiresAt: transaction.expiresAt,
      });
    } catch (error) {
      await this.recordInitiationFailure(transaction.id, error);
      throw error;
    }
    return {
      transactionId: transaction.id,
      appointmentId: transaction.appointmentId,
      provider: transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
      merchantTransactionId: transaction.merchantTransactionId,
      paymentUrl: result.paymentUrl,
      expiresAt: result.expiresAt,
    };
  }

  async handleVnpayIpn(payload: unknown): Promise<PaymentFinalizeOutcome> {
    return this.finalizer.finalize(await this.vnpay.verifyCallback(payload));
  }

  async handleMomoIpn(payload: unknown): Promise<PaymentFinalizeOutcome> {
    return this.finalizer.finalize(await this.momo.verifyCallback(payload));
  }

  cancelPending(identifier: string, patientId: string): Promise<CancelPendingPaymentResponse> {
    return this.finalizer.cancelPending(identifier, patientId);
  }

  fallbackToClinic(identifier: string, patientId: string) {
    return this.finalizer.fallbackToClinic(identifier, patientId);
  }

  async status(identifier: string, patientId: string): Promise<PaymentStatusResponse> {
    const appointmentId = await this.resolveAppointmentId(identifier);
    const appointment = await this.dataSource.getRepository(AppointmentEntity).findOne({
      where: { id: appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found.');
    if (appointment.patientId !== patientId) {
      throw new ForbiddenException('Bạn không có quyền xem thanh toán này.');
    }
    const paymentRepository = this.dataSource.getRepository(PaymentTransactionEntity);
    let transaction = appointment.canonicalPaymentTransactionId
      ? await paymentRepository.findOne({
          where: {
            id: appointment.canonicalPaymentTransactionId,
            appointmentId,
          },
        })
      : null;

    if (!transaction && !this.isUuid(identifier)) {
      transaction = await paymentRepository.findOne({
        where: { merchantTransactionId: identifier, appointmentId },
      });
    }

    if (!transaction) {
      transaction = await paymentRepository.findOne({
        where: { appointmentId },
        order: { createdAt: 'DESC' },
      });
    }

    const payments = await paymentRepository.find({ where: { appointmentId } });
    const unresolved = payments.some((payment) => [PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      PaymentTransactionStatus.SUCCESS, PaymentTransactionStatus.LATE_SUCCESS].includes(payment.status));
    const recoverable = appointment.status === AppointmentStatus.PENDING_PAYMENT &&
      !!appointment.reservationExpiresAt && appointment.reservationExpiresAt.getTime() > Date.now() &&
      ![PaymentStatus.PAID, PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED].includes(appointment.paymentStatus) && !unresolved;
    const canFallbackToClinic = recoverable && !appointment.canonicalPaymentTransactionId && permitsClinicFallback(payments);
    return {
      appointmentId,
      appointmentCode: appointment.appointmentCode,
      idempotencyKey: transaction?.idempotencyKey,
      failureCode: transaction?.status === PaymentTransactionStatus.FAILED ? 'PROVIDER_REJECTED' : null,
      canRetry: recoverable,
      canSwitchProvider: recoverable,
      canFallbackToClinic,
      appointmentStatus: appointment.status,
      paymentStatus: appointment.paymentStatus,
      provider: appointment.paymentMethod,
      transactionStatus: transaction?.status ?? null,
      expiresAt: appointment.reservationExpiresAt ?? transaction?.expiresAt ?? null,
      paidAt: transaction?.paidAt ?? appointment.paidAt,
    };
  }

  pendingRefunds(): Promise<RefundRequestEntity[]> {
    return this.dataSource.getRepository(RefundRequestEntity).find({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  async resolveRefund(
    refundId: string,
    adminId: string,
    dto: ResolveRefundDto,
  ): Promise<RefundRequestEntity> {
    if (dto.outcome === 'SUCCEEDED' && !dto.providerRefundId?.trim()) {
      throw new BadRequestException('providerRefundId is required for a successful refund.');
    }
    if (dto.outcome === 'FAILED' && !dto.failureReason?.trim()) {
      throw new BadRequestException('failureReason is required for a failed refund.');
    }

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RefundRequestEntity);
      const snapshot = await repository.findOne({ where: { id: refundId } });
      if (!snapshot) throw new NotFoundException('Refund request not found.');

      const appointment = await manager
        .getRepository(AppointmentEntity)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.id = :appointmentId', {
          appointmentId: snapshot.appointmentId,
        })
        .getOneOrFail();
      const refund = await repository
        .createQueryBuilder('refund')
        .setLock('pessimistic_write')
        .where('refund.id = :refundId', { refundId })
        .getOneOrFail();
      if (refund.status !== 'PENDING' && refund.status !== 'PROCESSING') {
        throw new ConflictException('Refund request has already been resolved.');
      }

      refund.attempts += 1;
      refund.processedAt = new Date();
      refund.processedBy = adminId;
      refund.status = dto.outcome;
      refund.providerRefundId = dto.providerRefundId?.trim() || null;
      refund.failureReason = dto.failureReason?.trim() || null;

      let refundsOnlyLatePayment = false;
      if (
        dto.outcome === 'SUCCEEDED' &&
        refund.paymentTransactionId &&
        !appointment.canonicalPaymentTransactionId &&
        appointment.paymentStatus === PaymentStatus.REFUND_PENDING
      ) {
        const refundPayment = await manager
          .getRepository(PaymentTransactionEntity)
          .findOneBy({ id: refund.paymentTransactionId });
        refundsOnlyLatePayment =
          refundPayment?.status === PaymentTransactionStatus.LATE_SUCCESS;
      }

      if (
        dto.outcome === 'SUCCEEDED' &&
        (!refund.paymentTransactionId ||
          refund.paymentTransactionId === appointment.canonicalPaymentTransactionId ||
          refundsOnlyLatePayment)
      ) {
        if (refundsOnlyLatePayment && appointment.paymentMethod === PaymentMethod.PAY_AT_CLINIC) {
          const otherRefunds = await repository.find({ where: { appointmentId: appointment.id } });
          // Do not unlock collection while another overpayment still needs a refund.
          const unresolved = otherRefunds.some(other => other.id !== refund.id && other.status !== 'SUCCEEDED');
          appointment.paymentStatus = unresolved ? PaymentStatus.REFUND_PENDING : PaymentStatus.UNPAID;
          if (!unresolved) appointment.paidAt = null;
        } else {
          appointment.paymentStatus = PaymentStatus.REFUNDED;
        }
        await manager.save(appointment);
      }
      return manager.save(refund);
    });
  }

  private provider(method: PaymentMethod): PaymentProvider {
    if (method === PaymentMethod.VNPAY) return this.vnpay;
    if (method === PaymentMethod.MOMO) return this.momo;
    throw new BadRequestException('Unsupported online payment provider.');
  }

  private async recordInitiationFailure(transactionId: string, error: unknown): Promise<void> {
    const definitive = error instanceof PaymentProviderError && error.isDefinitive;
    const message = error instanceof PaymentProviderError
      ? `${error.kind}: ${error.message}`
      : 'UNKNOWN: Provider initiation did not return a trusted result.';
    await this.dataSource.getRepository(PaymentTransactionEntity).update(
      { id: transactionId, status: PaymentTransactionStatus.PENDING },
      definitive
        ? {
            status: PaymentTransactionStatus.FAILED,
            lastReconcileError: message.slice(0, 500),
            nextReconcileAt: null,
          }
        : {
            status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
            lastReconcileError: message.slice(0, 500),
            nextReconcileAt: new Date(Date.now() + 60_000),
          },
    );
  }

  private merchantTransactionId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const entropy = randomBytes(8).toString('hex').toUpperCase();
    return `PAY${timestamp}${entropy}`;
  }

  private normalizeIp(value: string): string {
    const first = value.split(',')[0]?.trim() || '127.0.0.1';
    return first.replace(/^::ffff:/, '');
  }

  async resolveAppointmentId(identifier: string, manager?: EntityManager): Promise<string> {
    const trimmed = identifier?.trim();
    if (!trimmed) {
      throw new NotFoundException('Không tìm thấy lịch hẹn hoặc giao dịch thanh toán.');
    }
    const appointmentRepo = manager
      ? manager.getRepository(AppointmentEntity)
      : this.dataSource.getRepository(AppointmentEntity);
    const paymentRepo = manager
      ? manager.getRepository(PaymentTransactionEntity)
      : this.dataSource.getRepository(PaymentTransactionEntity);

    if (this.isUuid(trimmed)) {
      if (appointmentRepo?.findOne) {
        const appointment = await appointmentRepo.findOne({
          where: { id: trimmed },
          select: ['id'],
        });
        if (appointment) return appointment.id;
      }
      if (paymentRepo?.findOne) {
        const transaction = await paymentRepo.findOne({
          where: [{ id: trimmed }, { merchantTransactionId: trimmed }],
          select: ['appointmentId'],
        });
        if (transaction?.appointmentId) return transaction.appointmentId;
      }
      return trimmed;
    } else {
      if (paymentRepo?.findOne) {
        const transaction = await paymentRepo.findOne({
          where: { merchantTransactionId: trimmed },
          select: ['appointmentId'],
        });
        if (transaction?.appointmentId) return transaction.appointmentId;
      }
    }

    throw new NotFoundException('Không tìm thấy lịch hẹn hoặc giao dịch thanh toán.');
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
