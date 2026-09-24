import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { VoucherEntity } from '../../database/entities/voucher.entity';
import { RefundRequestEntity } from '../../database/entities/refund-request.entity';
import { AppointmentNotificationEntity } from '../../database/entities/appointment-notification.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { NotificationProducerService } from '../notification/producers/notification-producer.service';
import { QueueEventsService } from '../realtime/queue-events.service';
import { AppointmentStatus, PaymentStatus, Role, SlotStatus } from '@shared/enums';

const TRANSITIONS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  [AppointmentStatus.PENDING_PAYMENT]: [AppointmentStatus.CONFIRMED, AppointmentStatus.EXPIRED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.CHECKED_IN, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED_BY_PATIENT, AppointmentStatus.CANCELLED_BY_CLINIC],
  [AppointmentStatus.CHECKED_IN]: [AppointmentStatus.IN_CONSULTATION],
  [AppointmentStatus.IN_CONSULTATION]: [AppointmentStatus.COMPLETED],
};
export interface AppointmentActor { userId: string; role: Role }
@Injectable()
export class AppointmentLifecycleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationProducer: NotificationProducerService,
    private readonly queueEvents: QueueEventsService,
  ) {}
  static patientRefundPercent(scheduledAt: Date, now = new Date()): number { const hours = (scheduledAt.getTime() - now.getTime()) / 3600000; return hours >= 24 ? 100 : hours >= 2 ? 70 : 0; }
  async listForPatient(patientId: string): Promise<AppointmentEntity[]> { return this.dataSource.getRepository(AppointmentEntity).find({ where: { patientId }, relations: { doctor: true, schedule: true }, order: { id: 'DESC' } }); }
  async listVouchers(patientId: string): Promise<VoucherEntity[]> { return this.dataSource.getRepository(VoucherEntity).find({ where: { userId: patientId }, order: { expiresAt: 'ASC' } }); }
  async validateVoucher(patientId: string, code: string, totalAmount: number): Promise<{ code: string; discountPercent: number; discountAmount: number; finalAmount: number }> {
    if (!Number.isFinite(totalAmount) || totalAmount < 0) throw new BadRequestException('Tổng tiền không hợp lệ.');
    const voucher = await this.dataSource.getRepository(VoucherEntity).findOne({ where: { userId: patientId, code: code.trim().toUpperCase(), isUsed: false } });
    if (!voucher || voucher.expiresAt <= new Date()) throw new BadRequestException('Voucher không hợp lệ hoặc đã hết hạn.');
    const discountAmount = Math.round(totalAmount * Number(voucher.discountPercent)) / 100;
    return { code: voucher.code, discountPercent: Number(voucher.discountPercent), discountAmount, finalAmount: Math.max(0, totalAmount - discountAmount) };
  }
  async transition(id: string, target: AppointmentStatus, actor: AppointmentActor): Promise<AppointmentEntity> {
    if (![Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN].includes(actor.role)) throw new ForbiddenException('Bạn không có quyền đổi trạng thái lịch hẹn.');
    if (actor.role === Role.RECEPTIONIST && target !== AppointmentStatus.CHECKED_IN) throw new ForbiddenException('Lễ tân chỉ có thể check-in lịch hẹn.');
    if (actor.role === Role.DOCTOR && ![AppointmentStatus.IN_CONSULTATION, AppointmentStatus.COMPLETED].includes(target)) throw new ForbiddenException('Bác sĩ chỉ có thể bắt đầu hoặc hoàn tất ca khám.');
    const result = await this.dataSource.transaction((manager) => this.transitionWithin(manager, id, target, actor));
    await this.queueEvents.statusChanged(result.appointment.id, result.previousStatus, 'APPOINTMENT_LIFECYCLE');
    return result.appointment;
  }
  async cancelByPatient(id: string, actor: AppointmentActor, reason?: string): Promise<AppointmentEntity> { return this.dataSource.transaction(async (manager) => { const appointment = await this.lockAppointment(manager, id); if (appointment.patientId !== actor.userId) throw new ForbiddenException('Bạn chỉ có thể hủy lịch hẹn của chính mình.'); if (![AppointmentStatus.PENDING_PAYMENT, AppointmentStatus.CONFIRMED].includes(appointment.status)) throw new BadRequestException('Lịch hẹn hiện không thể hủy.'); const schedule = await manager.getRepository(DoctorScheduleEntity).findOneByOrFail({ id: appointment.scheduleId }); return this.cancelWithin(manager, appointment, AppointmentStatus.CANCELLED_BY_PATIENT, actor.userId, reason, AppointmentLifecycleService.patientRefundPercent(this.scheduledAt(schedule))); }); }
  async cancelByClinic(id: string, actor: AppointmentActor, reason?: string): Promise<{ appointment: AppointmentEntity; voucher: VoucherEntity; refundRequest: RefundRequestEntity | null; notificationCount: number }> { if (![Role.DOCTOR, Role.ADMIN].includes(actor.role)) throw new ForbiddenException('Bạn không có quyền hủy lịch hẹn.'); return this.dataSource.transaction(async (manager) => { const appointment = await this.lockAppointment(manager, id); if (![AppointmentStatus.PENDING_PAYMENT, AppointmentStatus.CONFIRMED].includes(appointment.status)) throw new BadRequestException('Lịch hẹn hiện không thể hủy.'); await this.assertDoctorOwnership(manager, appointment, actor); const cancelled = await this.cancelWithin(manager, appointment, AppointmentStatus.CANCELLED_BY_CLINIC, actor.userId, reason, 100); const voucher = await manager.save(manager.create(VoucherEntity, { userId: cancelled.patientId, code: this.generateVoucherCode(), discountPercent: 20, isUsed: false, expiresAt: this.addMonths(new Date(), 6), usedAt: null, issuedForAppointmentId: cancelled.id, redeemedAppointmentId: null })); let refundRequest: RefundRequestEntity | null = null; if (cancelled.paymentStatus === PaymentStatus.PAID && cancelled.refundAmount > 0 && cancelled.paymentMethod !== 'PAY_AT_CLINIC') { cancelled.paymentStatus = PaymentStatus.REFUND_PENDING; await manager.save(cancelled); refundRequest = await manager.save(manager.create(RefundRequestEntity, { appointmentId: cancelled.id, provider: cancelled.paymentMethod, amount: cancelled.refundAmount, status: 'PENDING', attempts: 0, failureReason: null, processedAt: null })); } const patient = await manager.getRepository(UserEntity).findOneByOrFail({ id: cancelled.patientId }); const message = 'Cơ sở y tế đã hủy lịch hẹn ' + cancelled.appointmentCode + '. Chúng tôi xin lỗi vì sự bất tiện này. Bạn nhận được voucher giảm 20% cho lần đặt khám tiếp theo.'; const notifications: AppointmentNotificationEntity[] = []; if (patient.email) notifications.push(manager.create(AppointmentNotificationEntity, { appointmentId: cancelled.id, channel: 'EMAIL', recipient: patient.email, subject: 'Thông báo hủy lịch hẹn', message, status: 'PENDING', attempts: 0, failureReason: null, sentAt: null })); if (patient.phoneNumber) notifications.push(manager.create(AppointmentNotificationEntity, { appointmentId: cancelled.id, channel: 'SMS', recipient: patient.phoneNumber, subject: null, message, status: 'PENDING', attempts: 0, failureReason: null, sentAt: null })); if (notifications.length) await manager.save(notifications);
      await Promise.all([
        patient.email ? this.notificationProducer.enqueueAppointmentCancellationEmail({ to: patient.email, patientName: patient.fullName, appointmentCode: cancelled.appointmentCode, voucherCode: voucher.code, refundPercent: Number(cancelled.refundPercent), refundAmount: Number(cancelled.refundAmount) }) : Promise.resolve(),
        patient.phoneNumber ? this.notificationProducer.enqueueAppointmentCancellationSms({ phoneNumber: patient.phoneNumber, patientName: patient.fullName, appointmentCode: cancelled.appointmentCode, voucherCode: voucher.code, refundPercent: Number(cancelled.refundPercent), refundAmount: Number(cancelled.refundAmount) }) : Promise.resolve(),
      ]);
      return { appointment: cancelled, voucher, refundRequest, notificationCount: notifications.length }; }); }
  static isPaymentExpired(createdAt: Date, now = new Date()): boolean { return createdAt.getTime() <= now.getTime() - 10 * 60 * 1000; }
  async expirePendingPayments(now = new Date()): Promise<number> { if (!this.dataSource.isInitialized) return 0; const candidates = await this.dataSource.getRepository(AppointmentEntity).createQueryBuilder('appointment').where('appointment.status = :status', { status: AppointmentStatus.PENDING_PAYMENT }).andWhere('appointment.created_at <= :expiresAt', { expiresAt: new Date(now.getTime() - 10 * 60 * 1000) }).getMany(); let expired = 0; for (const candidate of candidates) await this.dataSource.transaction(async (manager) => { const appointment = await this.lockAppointment(manager, candidate.id); if (appointment.status !== AppointmentStatus.PENDING_PAYMENT || !AppointmentLifecycleService.isPaymentExpired(appointment.createdAt, now)) return; appointment.status = AppointmentStatus.EXPIRED; const schedule = await manager.getRepository(DoctorScheduleEntity).findOneByOrFail({ id: appointment.scheduleId }); if (schedule.status === SlotStatus.BOOKED) { schedule.status = SlotStatus.AVAILABLE; await manager.save(schedule); } await manager.save(appointment); expired += 1; }); return expired; }
  private async transitionWithin(manager: EntityManager, id: string, target: AppointmentStatus, actor: AppointmentActor, automated = false): Promise<{ appointment: AppointmentEntity; previousStatus: AppointmentStatus }> { const appointment = await this.lockAppointment(manager, id); if (!TRANSITIONS[appointment.status]?.includes(target)) throw new BadRequestException('Không thể chuyển trạng thái lịch hẹn.'); if (actor.role === Role.DOCTOR && !automated) await this.assertDoctorOwnership(manager, appointment, actor); const previousStatus = appointment.status; appointment.status = target; if (target === AppointmentStatus.CHECKED_IN) appointment.checkedInAt = new Date(); return { appointment: await manager.save(appointment), previousStatus }; }
  private async cancelWithin(manager: EntityManager, appointment: AppointmentEntity, status: AppointmentStatus, actorId: string, reason: string | undefined, percent: number): Promise<AppointmentEntity> { const refundAmount = appointment.paymentStatus === PaymentStatus.PAID ? Math.round(Number(appointment.totalAmount) * percent) / 100 : 0; appointment.status = status; appointment.cancelledAt = new Date(); appointment.cancelledBy = actorId; appointment.cancellationReason = reason?.trim() || null; appointment.refundPercent = percent; appointment.refundAmount = refundAmount; const schedule = await manager.getRepository(DoctorScheduleEntity).findOneByOrFail({ id: appointment.scheduleId }); if (schedule.status === SlotStatus.BOOKED) { schedule.status = SlotStatus.AVAILABLE; await manager.save(schedule); } return manager.save(appointment); }
  private async lockAppointment(manager: EntityManager, id: string): Promise<AppointmentEntity> { const appointment = await manager.getRepository(AppointmentEntity).createQueryBuilder('appointment').setLock('pessimistic_write').where('appointment.id = :id', { id }).getOne(); if (!appointment) throw new NotFoundException('Không tìm thấy lịch hẹn.'); return appointment; }
  private async assertDoctorOwnership(manager: EntityManager, appointment: AppointmentEntity, actor: AppointmentActor): Promise<void> { if (actor.role !== Role.DOCTOR) return; if (!await manager.getRepository(DoctorEntity).existsBy({ id: appointment.doctorId, userId: actor.userId })) throw new ForbiddenException('Bạn chỉ có thể thao tác lịch hẹn của chính mình.'); }
  private scheduledAt(schedule: DoctorScheduleEntity): Date { return new Date(schedule.date + 'T' + schedule.startTime + '+07:00'); }
  private addMonths(value: Date, months: number): Date { const result = new Date(value); result.setMonth(result.getMonth() + months); return result; }
  private generateVoucherCode(): string { return 'COMPENSATE-20-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
}
