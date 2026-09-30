import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  SlotStatus,
} from '@shared/enums';
import { CancelPendingPaymentResponse } from '@shared/interfaces';
import { RedisService } from '../../common/redis/redis.service';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { PaymentTransactionEntity } from '../../database/entities/payment-trans.entity';
import { RefundRequestEntity } from '../../database/entities/refund-request.entity';
import { VoucherEntity } from '../../database/entities/voucher.entity';
import { BookingService } from '../booking/booking.service';
import { VerifiedPaymentResult } from './types/verified-payment-result';
import { permitsClinicFallback } from './payment-recovery.policy';

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
  event?: Record<string, unknown>;
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
    if (finalized.event) this.logger.log(JSON.stringify(finalized.event));
    if (finalized.release) {
      await this.cleanupReservation(finalized.release, 'Payment committed');
    }
    return finalized.outcome;
  }

  async cancelPending(appointmentId: string, patientId: string): Promise<CancelPendingPaymentResponse> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      // Same lock order as initiation and callbacks: appointment, payment, schedule.
      const appointment = await manager.getRepository(AppointmentEntity)
        .createQueryBuilder('appointment').setLock('pessimistic_write')
        .where('appointment.id = :id', { id: appointmentId }).getOne();
      if (!appointment) throw new NotFoundException('Appointment not found.');
      if (appointment.patientId !== patientId) {
        throw new ForbiddenException('Bạn chỉ có thể hủy giao dịch của chính mình.');
      }
      if (appointment.canonicalPaymentTransactionId ||
        [PaymentStatus.PAID, PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED].includes(appointment.paymentStatus)) {
        throw new ConflictException('Giao dịch đã ghi nhận thanh toán. Vui lòng kiểm tra trạng thái lịch hẹn.');
      }
      const replay = appointment.status === AppointmentStatus.CANCELLED &&
        appointment.cancellationReason === 'PATIENT_CANCELLED_PAYMENT';
      if (!replay && appointment.status !== AppointmentStatus.PENDING_PAYMENT) {
        throw new ConflictException('Lịch hẹn không ở trạng thái chờ thanh toán.');
      }
      const payments = await manager.getRepository(PaymentTransactionEntity)
        .createQueryBuilder('payment').setLock('pessimistic_write')
        .where('payment.appointment_id = :appointmentId', { appointmentId }).getMany();
      const events: Record<string, unknown>[] = [];
      if (payments.some((payment) => [PaymentTransactionStatus.SUCCESS, PaymentTransactionStatus.LATE_SUCCESS].includes(payment.status))) {
        throw new ConflictException('Giao dịch đã ghi nhận thanh toán. Không thể hủy giao dịch chờ.');
      }
      if (!replay) {
        const schedule = await manager.getRepository(DoctorScheduleEntity)
          .createQueryBuilder('schedule').setLock('pessimistic_write')
          .where('schedule.id = :id', { id: appointment.scheduleId }).getOneOrFail();
        for (const payment of payments) {
          // Cancelling the appointment must not erase an uncertain financial outcome.
          if (payment.status === PaymentTransactionStatus.PENDING) {
            const previousStatus = payment.status;
            payment.status = PaymentTransactionStatus.SUPERSEDED;
            payment.nextReconcileAt = null;
            payment.reconciliationManualReview = false;
            await manager.save(payment);
            events.push(this.stateEvent(payment, appointment, previousStatus, 'PATIENT_CANCELLED_PAYMENT'));
          }
        }
        appointment.status = AppointmentStatus.CANCELLED;
        appointment.paymentStatus = PaymentStatus.FAILED;
        appointment.cancelledAt = new Date();
        appointment.cancelledBy = patientId;
        appointment.cancellationReason = 'PATIENT_CANCELLED_PAYMENT';
        if (schedule.status === SlotStatus.HOLDING) {
          schedule.status = SlotStatus.AVAILABLE;
          await manager.save(schedule);
        }
        await this.releaseVoucherWithin(manager, appointment);
        await manager.save(appointment);
      }
      return {
        events: events.map((event) => ({ ...event, appointmentStatus: appointment.status })),
        response: { appointmentId, appointmentStatus: AppointmentStatus.CANCELLED as const, paymentStatus: appointment.paymentStatus },
        release: appointment.reservationId ? this.reservationRelease(appointment, appointment.reservationId) : undefined,
      };
    });
    for (const event of cancelled.events) this.logger.log(JSON.stringify(event));
    if (cancelled.release) await this.cleanupReservation(cancelled.release, 'Patient cancelled checkout');
    return cancelled.response;
  }

  async fallbackToClinic(appointmentId: string, patientId: string) {
    const changed = await this.dataSource.transaction(async (manager) => {
      const appointment = await manager.getRepository(AppointmentEntity)
        .createQueryBuilder('appointment').setLock('pessimistic_write')
        .where('appointment.id = :id', { id: appointmentId }).getOne();
      if (!appointment) throw new NotFoundException('Appointment not found.');
      if (appointment.patientId !== patientId) throw new ForbiddenException('Checkout owner mismatch.');
      if (appointment.status !== AppointmentStatus.PENDING_PAYMENT || !appointment.reservationExpiresAt ||
        appointment.reservationExpiresAt.getTime() <= Date.now() ||
        [PaymentStatus.PAID, PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED].includes(appointment.paymentStatus)) {
        throw new ConflictException('Checkout is no longer recoverable.');
      }
      const payments = await manager.getRepository(PaymentTransactionEntity)
        .createQueryBuilder('payment').setLock('pessimistic_write')
        .where('payment.appointment_id = :appointmentId', { appointmentId }).getMany();
      if (appointment.canonicalPaymentTransactionId || !permitsClinicFallback(payments)) {
        throw new ConflictException('An online payment is still unresolved. Cannot switch to clinic payment.');
      }
      const schedule = await manager.getRepository(DoctorScheduleEntity)
        .createQueryBuilder('schedule').setLock('pessimistic_write')
        .where('schedule.id = :id', { id: appointment.scheduleId }).getOneOrFail();
      if (schedule.status !== SlotStatus.HOLDING) throw new ConflictException('Checkout no longer owns its slot.');
      appointment.status = AppointmentStatus.CONFIRMED;
      appointment.paymentStatus = PaymentStatus.UNPAID;
      appointment.paymentMethod = PaymentMethod.PAY_AT_CLINIC;
      schedule.status = SlotStatus.BOOKED;
      await manager.save(appointment);
      await manager.save(schedule);
      return { appointmentId, release: appointment.reservationId ? this.reservationRelease(appointment, appointment.reservationId) : undefined };
    });
    if (changed.release) await this.cleanupReservation(changed.release, 'Clinic fallback committed');
    return { appointmentId: changed.appointmentId, appointmentStatus: AppointmentStatus.CONFIRMED, paymentStatus: PaymentStatus.UNPAID };
  }

  async expireReservationForReconciliation(
    provider: VerifiedPaymentResult['provider'],
    merchantTransactionId: string,
    now = new Date(),
    force = false,
  ): Promise<void> {
    const finalized = await this.dataSource.transaction(async (manager) => {
      const { payment, appointment } = await this.lockPaymentContext(manager, provider, merchantTransactionId);
      const previousStatus = payment.status;
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
      if (!force && (!appointment.reservationExpiresAt || appointment.reservationExpiresAt > now)) return {};

      payment.status = PaymentTransactionStatus.RECONCILIATION_REQUIRED;
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.cancelledAt = now;
      appointment.cancellationReason = 'PAYMENT_TIMEOUT';
      if (schedule.status === SlotStatus.HOLDING) {
        schedule.status = SlotStatus.AVAILABLE;
      }
      await this.releaseVoucherWithin(manager, appointment);
      await manager.save(payment);
      await manager.save(appointment);
      await manager.save(schedule);
      return { release: this.reservationRelease(appointment, payment.reservationId), event: this.stateEvent(payment, appointment, previousStatus, 'RESERVATION_EXPIRED') };
    });

    if (finalized.event) this.logger.log(JSON.stringify(finalized.event));
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
    const { payment, appointment } = await this.lockPaymentContext(manager, result.provider, result.merchantTransactionId);
    const previousStatus = payment.status;
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
        event: payment.status !== previousStatus ? this.stateEvent(payment, appointment, previousStatus, result.state) : undefined,
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
      return { outcome: 'LATE_SUCCESS', event: this.stateEvent(payment, appointment, previousStatus, 'LATE_CALLBACK') };
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
        return { outcome: 'LATE_SUCCESS', event: this.stateEvent(payment, appointment, previousStatus, 'CLOSED_CHECKOUT_CALLBACK') };
      }
      payment.status = PaymentTransactionStatus.FAILED;
      appointment.paymentStatus = PaymentStatus.FAILED;
      await manager.save(payment);
      await manager.save(appointment);
      return { outcome: 'FAILED' };
    }

    const reservationExpired = !!appointment.reservationExpiresAt && appointment.reservationExpiresAt.getTime() <= Date.now();
    if (reservationExpired) {
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.cancelledAt = new Date();
      appointment.cancellationReason = 'PAYMENT_TIMEOUT';
      appointment.paymentStatus = result.state === 'SUCCESS' ? PaymentStatus.REFUND_PENDING : PaymentStatus.FAILED;
      payment.status = result.state === 'SUCCESS' ? PaymentTransactionStatus.LATE_SUCCESS : PaymentTransactionStatus.FAILED;
      if (result.state === 'SUCCESS') {
        payment.paidAt = new Date();
        appointment.paidAt = payment.paidAt;
        await this.createLateSuccessRefundWithin(manager, appointment, payment);
      }
      if (schedule.status === SlotStatus.HOLDING) schedule.status = SlotStatus.AVAILABLE;
      await this.releaseVoucherWithin(manager, appointment);
    } else if (result.state === 'SUCCESS') {
      payment.status = PaymentTransactionStatus.SUCCESS;
      payment.paidAt = new Date();
      appointment.status = AppointmentStatus.CONFIRMED;
      appointment.paymentStatus = PaymentStatus.PAID;
      appointment.paidAt = payment.paidAt;
      appointment.canonicalPaymentTransactionId = payment.id;
      schedule.status = SlotStatus.BOOKED;
    } else {
      payment.status = PaymentTransactionStatus.FAILED;
      appointment.paymentStatus = PaymentStatus.FAILED;
      // A failed attempt does not close a checkout while its reservation is valid.
    }

    await manager.save(payment);
    await manager.save(appointment);
    await manager.save(schedule);
    return {
      outcome: result.state === 'SUCCESS' ? (reservationExpired ? 'LATE_SUCCESS' : 'SUCCESS') : 'FAILED',
      release: result.state === 'SUCCESS' || reservationExpired ? this.reservationRelease(appointment, payment.reservationId) : undefined,
      event: this.stateEvent(payment, appointment, previousStatus, reservationExpired ? 'RESERVATION_EXPIRED' : result.state),
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

  private stateEvent(payment: PaymentTransactionEntity, appointment: AppointmentEntity, fromTransactionStatus: PaymentTransactionStatus, reason: string) {
    return { event: 'payment.state_changed', appointmentId: appointment.id, transactionId: payment.id,
      merchantTransactionId: payment.merchantTransactionId, requestId: payment.requestId, provider: payment.provider,
      fromTransactionStatus, toTransactionStatus: payment.status, appointmentStatus: appointment.status,
      reservationExpiresAt: appointment.reservationExpiresAt, reason };
  }

  private async lockPaymentContext(manager: EntityManager, provider: VerifiedPaymentResult['provider'], merchantTransactionId: string) {
    const repository = manager.getRepository(PaymentTransactionEntity);
    const snapshot = await repository.findOne({ where: { provider, merchantTransactionId } });
    if (!snapshot) throw new NotFoundException('Payment transaction not found.');
    const appointment = await manager.getRepository(AppointmentEntity)
      .createQueryBuilder('appointment').setLock('pessimistic_write')
      .where('appointment.id = :id', { id: snapshot.appointmentId }).getOneOrFail();
    const payment = await repository.createQueryBuilder('payment').setLock('pessimistic_write')
      .where('payment.id = :id', { id: snapshot.id }).getOneOrFail();
    return { payment, appointment };
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
