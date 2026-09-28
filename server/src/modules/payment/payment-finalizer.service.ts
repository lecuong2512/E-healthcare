import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AppointmentStatus,
  PaymentStatus,
  PaymentTransactionStatus,
  SlotStatus,
} from '@shared/enums';
import { RedisService } from '../../common/redis/redis.service';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { PaymentTransactionEntity } from '../../database/entities/payment-trans.entity';
import { BookingService } from '../booking/booking.service';
import { VerifiedPaymentResult } from './types/verified-payment-result';

export type PaymentFinalizeOutcome =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'RECONCILIATION_REQUIRED'
  | 'LATE_SUCCESS'
  | 'ALREADY_FINALIZED';

interface FinalizeTransactionResult {
  outcome: PaymentFinalizeOutcome;
  release?: { key: string; reservationId: string };
}

@Injectable()
export class PaymentFinalizerService {
  private readonly logger = new Logger(PaymentFinalizerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async finalize(result: VerifiedPaymentResult): Promise<PaymentFinalizeOutcome> {
    const finalized = await this.dataSource.transaction((manager) =>
      this.finalizeWithin(manager, result),
    );
    if (finalized.release) {
      try {
        await this.redis.releaseLockIfOwner(
          finalized.release.key,
          finalized.release.reservationId,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Payment committed but reservation cleanup failed: ${message}`);
      }
    }
    return finalized.outcome;
  }

  private async finalizeWithin(
    manager: EntityManager,
    result: VerifiedPaymentResult,
  ): Promise<FinalizeTransactionResult> {
    // Fixed lock order for IPN, retry, timeout and reconciliation paths.
    const payment = await manager
      .getRepository(PaymentTransactionEntity)
      .createQueryBuilder('payment')
      .setLock('pessimistic_write')
      .where('payment.provider = :provider', { provider: result.provider })
      .andWhere('payment.merchant_transaction_id = :merchantTransactionId', {
        merchantTransactionId: result.merchantTransactionId,
      })
      .getOne();
    if (!payment) throw new NotFoundException('Payment transaction not found.');

    const appointment = await manager
      .getRepository(AppointmentEntity)
      .createQueryBuilder('appointment')
      .setLock('pessimistic_write')
      .where('appointment.id = :id', { id: payment.appointmentId })
      .getOneOrFail();
    const schedule = await manager
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder('schedule')
      .setLock('pessimistic_write')
      .where('schedule.id = :id', { id: appointment.scheduleId })
      .getOneOrFail();

    if (Number(payment.amountVnd) !== result.amountVnd) {
      throw new BadRequestException('Payment amount mismatch.');
    }
    payment.providerTransactionId = result.providerTransactionId || payment.providerTransactionId;
    payment.responseCode = result.responseCode;
    payment.providerStatus = result.rawProviderStatus || null;
    payment.callbackReceivedAt = new Date();
    payment.signatureVerified = result.signatureVerified;
    payment.sanitizedProviderPayload = result.sanitizedPayload;

    if (result.state === 'PENDING' || result.state === 'UNKNOWN') {
      if (result.state === 'UNKNOWN') {
        payment.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
      }
      await manager.save(payment);
      return {
        outcome:
          result.state === 'PENDING' ? 'PENDING' : 'RECONCILIATION_REQUIRED',
      };
    }

    if (payment.status === PaymentTransactionStatus.SUCCESS) {
      await manager.save(payment);
      return { outcome: 'ALREADY_FINALIZED' };
    }
    if (
      [
        PaymentTransactionStatus.FAILED,
        PaymentTransactionStatus.TIMEOUT,
        PaymentTransactionStatus.SUPERSEDED,
      ].includes(payment.status) &&
      result.state === 'SUCCESS'
    ) {
      payment.status = PaymentTransactionStatus.LATE_SUCCESS;
      await manager.save(payment);
      return { outcome: 'LATE_SUCCESS' };
    }
    if (payment.status === PaymentTransactionStatus.FAILED) {
      await manager.save(payment);
      return { outcome: 'ALREADY_FINALIZED' };
    }
    if (appointment.status !== AppointmentStatus.PENDING_PAYMENT) {
      payment.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
      await manager.save(payment);
      return { outcome: 'RECONCILIATION_REQUIRED' };
    }

    if (result.state === 'SUCCESS') {
      payment.status = PaymentTransactionStatus.SUCCESS;
      payment.paidAt = new Date();
      appointment.status = AppointmentStatus.CONFIRMED;
      appointment.paymentStatus = PaymentStatus.PAID;
      appointment.paidAt = payment.paidAt;
      schedule.status = SlotStatus.BOOKED;
    } else {
      payment.status = PaymentTransactionStatus.FAILED;
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.paymentStatus = PaymentStatus.FAILED;
      appointment.cancelledAt = new Date();
      appointment.cancellationReason = 'Thanh toán trực tuyến thất bại.';
      schedule.status = SlotStatus.AVAILABLE;
    }

    await manager.save(payment);
    await manager.save(appointment);
    await manager.save(schedule);
    return {
      outcome: result.state === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      release: {
        key: BookingService.formatSlotLockKey(appointment.doctorId, appointment.scheduleId),
        reservationId: payment.reservationId,
      },
    };
  }
}
