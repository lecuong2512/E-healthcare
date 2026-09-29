import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentTransactionStatus,
} from '@shared/enums';
import {
  InitiatePaymentResponse,
  PaymentStatusResponse,
} from '@shared/interfaces';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../../database/entities/payment-trans.entity';
import { InitiatePaymentDto } from './dto';
import {
  MOMO_PROVIDER,
  VNPAY_PROVIDER,
} from './constants/payment.constants';
import { PaymentFinalizerService, PaymentFinalizeOutcome } from './payment-finalizer.service';
import { PaymentProvider } from './providers/payment-provider.interface';

@Injectable()
export class PaymentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly finalizer: PaymentFinalizerService,
    @Inject(VNPAY_PROVIDER) private readonly vnpay: PaymentProvider,
    @Inject(MOMO_PROVIDER) private readonly momo: PaymentProvider,
  ) {}

  async initiate(
    appointmentId: string,
    patientId: string,
    idempotencyKey: string,
    dto: InitiatePaymentDto,
    clientIp: string,
  ): Promise<InitiatePaymentResponse> {
    if (!this.isUuid(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key phải là UUID hợp lệ.');
    }
    const transaction = await this.dataSource.transaction(async (manager) => {
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

      const paymentRepository = manager.getRepository(PaymentTransactionEntity);
      const idempotent = await paymentRepository.findOne({
        where: { patientId, idempotencyKey },
      });
      if (idempotent) {
        if (idempotent.appointmentId !== appointmentId) {
          throw new ConflictException('Idempotency-Key đã được dùng cho lịch hẹn khác.');
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
        throw new ConflictException('Reservation đã hết hạn thanh toán.');
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
          sanitizedProviderPayload: null,
        }),
      );
    });

    const provider = this.provider(transaction.provider);
    const result = await provider.initiate({
      provider: transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
      merchantTransactionId: transaction.merchantTransactionId,
      requestId: transaction.requestId || transaction.merchantTransactionId,
      amountVnd: Number(transaction.amountVnd),
      clientIp: this.normalizeIp(clientIp),
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt,
    });
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

  async status(appointmentId: string, patientId: string): Promise<PaymentStatusResponse> {
    const appointment = await this.dataSource.getRepository(AppointmentEntity).findOne({
      where: { id: appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found.');
    if (appointment.patientId !== patientId) {
      throw new ForbiddenException('Bạn không có quyền xem thanh toán này.');
    }
    const transaction = await this.dataSource
      .getRepository(PaymentTransactionEntity)
      .findOne({ where: { appointmentId }, order: { createdAt: 'DESC' } });
    return {
      appointmentId,
      appointmentStatus: appointment.status,
      paymentStatus: appointment.paymentStatus,
      provider: appointment.paymentMethod,
      transactionStatus: transaction?.status ?? null,
      expiresAt: transaction?.expiresAt ?? null,
      paidAt: transaction?.paidAt ?? appointment.paidAt,
    };
  }

  private provider(method: PaymentMethod): PaymentProvider {
    if (method === PaymentMethod.VNPAY) return this.vnpay;
    if (method === PaymentMethod.MOMO) return this.momo;
    throw new BadRequestException('Unsupported online payment provider.');
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

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
