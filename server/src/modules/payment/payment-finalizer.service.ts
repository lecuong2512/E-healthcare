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
import { RefundRequestEntity } from '../../database/entities/refund-request.entity';
import { VoucherEntity } from '../../database/entities/voucher.entity';
import { BookingService } from '../booking/booking.service';
import { VerifiedPaymentResult } from './types/verified-payment-result';

export type PaymentFinalizeOutcome =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'RECONCILIATION_REQUIRED'
  | 'LATE_SUCCESS'
  | 'ALREADY_FINALIZED';

interface ReservationRelease {
  lockKey: string;
  metadataKey: string;
  reservationId: string;
}

interface FinalizeTransactionResult {
  outcome: PaymentFinalizeOutcome;
  release?: ReservationRelease;
}

@Injectable()
export class PaymentFinalizerService {
  private readonly logger = new Logger(PaymentFinalizerService.name);
  private static readonly MAX_RECONCILIATION_ATTEMPTS = 5;
  private static readonly RECONCILIATION_BACKOFF_SECONDS = [120, 300, 900, 1800];

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async finalize(result: VerifiedPaymentResult): Promise<PaymentFinalizeOutcome> {
    const finalized = await this.dataSource.transaction((manager) =>
      this.finalizeWithin(manager, result),
    );
    if (finalized.release) {
      await this.cleanupReservation(finalized.release, 'Payment committed');
    }
    return finalized.outcome;
  }

  async expireReservationForReconciliation(
    provider: VerifiedPaymentResult['provider'],
    merchantTransactionId: string,
  ): Promise<void> {
    const finalized = await this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(PaymentTransactionEntity)
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.provider = :provider', { provider })
        .andWhere('payment.merchant_transaction_id = :merchantTransactionId', {
          merchantTransactionId,
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

      if (
        ![
          PaymentTransactionStatus.PENDING,
          PaymentTransactionStatus.RECONCILIATION_REQUIRED,
        ].includes(payment.status) ||
        appointment.status !== AppointmentStatus.PENDING_PAYMENT
      ) {
        return {};
      }

      payment.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.cancelledAt = new Date();
      appointment.cancellationReason = 'PAYMENT_TIMEOUT';
      if (schedule.status === SlotStatus.HOLDING) {
        schedule.status = SlotStatus.AVAILABLE;
      }
      await this.releaseVoucherWithin(manager, appointment);
      await manager.save(payment);
      await manager.save(appointment);
      await manager.save(schedule);
      return { release: this.reservationRelease(appointment, payment.reservationId) };
    });

    if (finalized.release) {
      await this.cleanupReservation(finalized.release, 'Expired reservation');
    }
  }

  async expireOrphanAppointment(
    appointmentId: string,
    now = new Date(),
  ): Promise<boolean> {
    const expired = await this.dataSource.transaction(async (manager) => {
      const appointment = await manager
        .getRepository(AppointmentEntity)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.id = :id', { id: appointmentId })
        .getOne();
      if (
        !appointment ||
        appointment.status !== AppointmentStatus.PENDING_PAYMENT ||
        !appointment.reservationExpiresAt ||
        appointment.reservationExpiresAt > now
      ) {
        return { expired: false };
      }

      const activePaymentCount = await manager
        .getRepository(PaymentTransactionEntity)
        .createQueryBuilder('payment')
        .where('payment.appointment_id = :appointmentId', { appointmentId })
        .andWhere('payment.status IN (:...statuses)', {
          statuses: [
            PaymentTransactionStatus.PENDING,
            PaymentTransactionStatus.RECONCILIATION_REQUIRED,
          ],
        })
        .getCount();
      if (activePaymentCount > 0) return { expired: false };

      const schedule = await manager
        .getRepository(DoctorScheduleEntity)
        .createQueryBuilder('schedule')
        .setLock('pessimistic_write')
        .where('schedule.id = :id', { id: appointment.scheduleId })
        .getOneOrFail();

      appointment.status = AppointmentStatus.CANCELLED;
      appointment.paymentStatus = PaymentStatus.FAILED;
      appointment.cancelledAt = now;
      appointment.cancellationReason = 'PAYMENT_TIMEOUT';
      if (schedule.status === SlotStatus.HOLDING) {
        schedule.status = SlotStatus.AVAILABLE;
      }
      await this.releaseVoucherWithin(manager, appointment);
      await manager.save(appointment);
      await manager.save(schedule);
      return {
        expired: true,
        release: appointment.reservationId
          ? this.reservationRelease(appointment, appointment.reservationId)
          : undefined,
      };
    });

    if (expired.release) {
      await this.cleanupReservation(expired.release, 'Orphan reservation');
    }
    return expired.expired;
  }

  async scheduleReconciliationRetry(
    provider: VerifiedPaymentResult['provider'],
    merchantTransactionId: string,
    reason: string,
    now = new Date(),
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(PaymentTransactionEntity)
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.provider = :provider', { provider })
        .andWhere('payment.merchant_transaction_id = :merchantTransactionId', {
          merchantTransactionId,
        })
        .getOne();
        if (
          !payment ||
          ![
            PaymentTransactionStatus.PENDING,
            PaymentTransactionStatus.RECONCILIATION_REQUIRED,
          ].includes(payment.status)
        ) return;

      payment.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
      payment.reconciliationAttempts = (payment.reconciliationAttempts || 0) + 1;
      payment.lastReconcileError = reason.slice(0, 2_000);
      if (
        payment.reconciliationAttempts >=
        PaymentFinalizerService.MAX_RECONCILIATION_ATTEMPTS
      ) {
        payment.reconciliationManualReview = true;
        payment.nextReconcileAt = null;
      } else {
        const backoffIndex = Math.min(
          payment.reconciliationAttempts - 1,
          PaymentFinalizerService.RECONCILIATION_BACKOFF_SECONDS.length - 1,
        );
        payment.nextReconcileAt = new Date(
          now.getTime() +
            PaymentFinalizerService.RECONCILIATION_BACKOFF_SECONDS[backoffIndex] *
              1_000,
        );
      }
      await manager.save(payment);
    });
  }

  private async finalizeWithin(
    manager: EntityManager,
    result: VerifiedPaymentResult,
  ): Promise<FinalizeTransactionResult> {
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
    if (
      result.provider === 'MOMO' &&
      result.requestId !== undefined &&
      result.requestId !== payment.requestId
    ) {
      throw new BadRequestException('MoMo requestId mismatch.');
    }
    if (
      payment.providerTransactionId &&
      result.providerTransactionId &&
      payment.providerTransactionId !== result.providerTransactionId
    ) {
      throw new BadRequestException('Provider transaction ID mismatch.');
    }
    if (!payment.providerTransactionId && result.providerTransactionId) {
      payment.providerTransactionId = result.providerTransactionId;
    }
    payment.responseCode = result.responseCode;
    payment.providerStatus = result.rawProviderStatus || null;
    payment.callbackReceivedAt = new Date();
    payment.signatureVerified = result.signatureVerified;
    payment.sourceValidated = result.sourceValidated;
    payment.sanitizedProviderPayload = result.sanitizedPayload;
    if (result.state === 'SUCCESS' || result.state === 'FINAL_FAILED') {
      payment.nextReconcileAt = null;
      payment.lastReconcileError = null;
      payment.reconciliationManualReview = false;
    }

    if (
      payment.status === PaymentTransactionStatus.SUCCESS ||
      payment.status === PaymentTransactionStatus.LATE_SUCCESS
    ) {
      await manager.save(payment);
      return { outcome: 'ALREADY_FINALIZED' };
    }
    if (
      [
        PaymentTransactionStatus.FAILED,
        PaymentTransactionStatus.TIMEOUT,
        PaymentTransactionStatus.SUPERSEDED,
      ].includes(payment.status) &&
      result.state !== 'SUCCESS'
    ) {
      await manager.save(payment);
      return { outcome: 'ALREADY_FINALIZED' };
    }

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

    if (
      [
        PaymentTransactionStatus.FAILED,
        PaymentTransactionStatus.TIMEOUT,
        PaymentTransactionStatus.SUPERSEDED,
      ].includes(payment.status) &&
      result.state === 'SUCCESS'
    ) {
      payment.status = PaymentTransactionStatus.LATE_SUCCESS;
      payment.paidAt = new Date();
      if (appointment.paymentStatus !== PaymentStatus.PAID) {
        appointment.paymentStatus = PaymentStatus.REFUND_PENDING;
        appointment.paidAt = payment.paidAt;
      }
      await manager.save(payment);
      await manager.save(appointment);
      await this.createLateSuccessRefundWithin(manager, appointment, payment);
      return { outcome: 'LATE_SUCCESS' };
    }
    if (payment.status === PaymentTransactionStatus.FAILED) {
      await manager.save(payment);
      return { outcome: 'ALREADY_FINALIZED' };
    }
    if (appointment.status !== AppointmentStatus.PENDING_PAYMENT) {
      if (result.state === 'SUCCESS') {
        payment.status = PaymentTransactionStatus.LATE_SUCCESS;
        payment.paidAt = new Date();
        if (appointment.paymentStatus !== PaymentStatus.PAID) {
          appointment.paymentStatus = PaymentStatus.REFUND_PENDING;
          appointment.paidAt = payment.paidAt;
        }
        await manager.save(appointment);
        await manager.save(payment);
        await this.createLateSuccessRefundWithin(manager, appointment, payment);
        return { outcome: 'LATE_SUCCESS' };
      }
      payment.status = PaymentTransactionStatus.FAILED;
      appointment.paymentStatus = PaymentStatus.FAILED;
      await manager.save(payment);
      await manager.save(appointment);
      return { outcome: 'FAILED' };
    }

    if (result.state === 'SUCCESS') {
      payment.status = PaymentTransactionStatus.SUCCESS;
      payment.paidAt = new Date();
      appointment.status = AppointmentStatus.CONFIRMED;
      appointment.paymentStatus = PaymentStatus.PAID;
      appointment.paidAt = payment.paidAt;
      appointment.canonicalPaymentTransactionId = payment.id;
      schedule.status = SlotStatus.BOOKED;
    } else {
      payment.status = PaymentTransactionStatus.FAILED;
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.paymentStatus = PaymentStatus.FAILED;
      appointment.cancelledAt = new Date();
      appointment.cancellationReason = 'ONLINE_PAYMENT_FAILED';
      schedule.status = SlotStatus.AVAILABLE;
      await this.releaseVoucherWithin(manager, appointment);
    }

    await manager.save(payment);
    await manager.save(appointment);
    await manager.save(schedule);
    return {
      outcome: result.state === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      release: this.reservationRelease(appointment, payment.reservationId),
    };
  }

  private reservationRelease(
    appointment: AppointmentEntity,
    reservationId: string,
  ): ReservationRelease {
    return {
      lockKey: BookingService.formatSlotLockKey(
        appointment.doctorId,
        appointment.scheduleId,
      ),
      metadataKey: BookingService.formatReservationKey(reservationId),
      reservationId,
    };
  }

  private async releaseVoucherWithin(
    manager: EntityManager,
    appointment: AppointmentEntity,
  ): Promise<void> {
    if (!appointment.voucherCode) return;
    const voucher = await manager
      .getRepository(VoucherEntity)
      .createQueryBuilder('voucher')
      .setLock('pessimistic_write')
      .where('voucher.redeemed_appointment_id = :appointmentId', {
        appointmentId: appointment.id,
      })
      .getOne();
    if (!voucher || voucher.redeemedAppointmentId !== appointment.id) return;
    voucher.isUsed = false;
    voucher.usedAt = null;
    voucher.redeemedAppointmentId = null;
    await manager.save(voucher);
  }

  private async createLateSuccessRefundWithin(
    manager: EntityManager,
    appointment: AppointmentEntity,
    payment: PaymentTransactionEntity,
  ): Promise<void> {
    const repository = manager.getRepository(RefundRequestEntity);
    const existing = await repository.findOne({
      where: { paymentTransactionId: payment.id },
    });
    if (existing) return;
    await manager.save(
      manager.create(RefundRequestEntity, {
        appointmentId: appointment.id,
        paymentTransactionId: payment.id,
        provider: payment.provider,
        amount: Number(payment.amountVnd),
        status: 'PENDING',
        attempts: 0,
        failureReason: null,
        processedAt: null,
      }),
    );
  }

  private async cleanupReservation(
    release: ReservationRelease,
    context: string,
  ): Promise<void> {
    try {
      await this.redis.releaseReservationIfOwner(
        release.lockKey,
        release.metadataKey,
        release.reservationId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${context} cleanup failed: ${message}`);
    }
  }
}
