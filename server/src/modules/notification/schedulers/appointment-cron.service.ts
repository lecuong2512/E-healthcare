import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { AppointmentEntity } from '../../../database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../../../database/entities/doctor-schedule.entity';
import { AppointmentStatus, SlotStatus } from '@shared/enums';
import { RedisService } from '../../../common/redis/redis.service';
import { NotificationProducerService } from '../producers/notification-producer.service';
import { AppointmentNotificationEntity, AppointmentReminderType } from '../../../database/entities/appointment-notification.entity';
import { environment } from '../../../config/environment';

import { WebPushService } from '../services/web-push.service';

export const NO_SHOW_GRACE_MINUTES = 30;
export const REMINDER_TIMEZONE = environment.APPOINTMENT_REMINDER_TIMEZONE?.trim() || 'Asia/Ho_Chi_Minh';
export const REMINDERS_ENABLED = environment.APPOINTMENT_REMINDERS_ENABLED?.trim().toLowerCase() !== 'false';
export const REMINDER_SCAN_MINUTES = 15;

export function localScheduleToInstant(date: string, time: string, timeZone = REMINDER_TIMEZONE): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? '0');
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }

  let instant = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = formatter.formatToParts(new Date(instant));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const representedAsUtc = Date.UTC(
      value('year'), value('month') - 1, value('day'),
      value('hour'), value('minute'), value('second'),
    );
    const corrected = localAsUtc - (representedAsUtc - instant);
    if (corrected === instant) break;
    instant = corrected;
  }

  const verified = formatter.formatToParts(new Date(instant));
  const rendered = verified.reduce<Record<string, string>>((parts, part) => {
    parts[part.type] = part.value;
    return parts;
  }, {});
  if (
    Number(rendered.year) !== year || Number(rendered.month) !== month ||
    Number(rendered.day) !== day || Number(rendered.hour) !== hour ||
    Number(rendered.minute) !== minute || Number(rendered.second) !== second
  ) return null;
  return new Date(instant);
}

export function isWithinReminderWindow(
  appointmentAt: Date,
  referenceTime: Date,
  targetHours: number,
  toleranceMinutes: number,
): boolean {
  const differenceMs = appointmentAt.getTime() - referenceTime.getTime();
  const targetMs = targetHours * 60 * 60 * 1000;
  const toleranceMs = toleranceMinutes * 60 * 1000;
  return differenceMs >= targetMs - toleranceMs && differenceMs <= targetMs + toleranceMs;
}

function isUniqueConstraintError(error: unknown): boolean {
  const value = error as { code?: string; driverError?: { code?: string } };
  return value?.code === '23505' || value?.driverError?.code === '23505';
}

@Injectable()
export class AppointmentCronService {
  private readonly logger = new Logger(AppointmentCronService.name);
  private appointmentRepo!: Repository<AppointmentEntity>;
  private scheduleRepo!: Repository<DoctorScheduleEntity>;
  private notificationRepo!: Repository<AppointmentNotificationEntity>;

  constructor(
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly notificationProducerService?: NotificationProducerService,
    @Optional() private readonly webPushService?: WebPushService,
  ) {
    if (this.dataSource && typeof this.dataSource.getRepository === 'function') {
      this.appointmentRepo = this.dataSource.getRepository(AppointmentEntity);
      this.scheduleRepo = this.dataSource.getRepository(DoctorScheduleEntity);
      this.notificationRepo = this.dataSource.getRepository(AppointmentNotificationEntity);
    }
  }

  /**
   * Cron 1: Quét tự động đánh dấu NO_SHOW các lịch hẹn quá 30 phút mà bệnh nhân không check-in (Section 5.2 & SRS-DOC-02)
   * Chạy định kỳ mỗi 15 phút và cuối ngày.
   */
  @Cron('*/15 * * * *')
  async scanAndMarkNoShow(referenceTime: Date = new Date()): Promise<number> {
    this.logger.log(`Running scanAndMarkNoShow cron at ${referenceTime.toISOString()}`);

    if (!this.appointmentRepo) {
      this.logger.warn('appointmentRepo is not initialized, skipping scanAndMarkNoShow');
      return 0;
    }

    const confirmedAppointments = await this.appointmentRepo.find({
      where: {
        status: AppointmentStatus.CONFIRMED,
      },
      relations: ['schedule'],
    });

    let count = 0;

    for (const appt of confirmedAppointments) {
      if (appt.checkedInAt) {
        continue;
      }

      if (!appt.schedule) {
        continue;
      }

      const scheduleDate = appt.schedule.date;
      const startTime = appt.schedule.startTime;
      const endTime = appt.schedule.endTime || startTime;

      // Construct appointment start & end time
      // date format: 'YYYY-MM-DD', time format: 'HH:mm:ss' or 'HH:mm'
      const apptEndDateTime = new Date(`${scheduleDate}T${endTime}+07:00`);
      if (isNaN(apptEndDateTime.getTime())) {
        continue;
      }

      // Quá 30 phút so với giờ hẹn kết thúc hoặc quá 30 phút so với giờ bắt đầu
      const cutoffTime = new Date(apptEndDateTime.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000);

      if (referenceTime >= cutoffTime) {
        appt.status = AppointmentStatus.NO_SHOW;
        await this.appointmentRepo.save(appt);
        count++;
        this.logger.warn(
          `Appointment ${appt.appointmentCode} marked as NO_SHOW (Scheduled: ${scheduleDate} ${endTime}, Cutoff: ${cutoffTime.toISOString()})`,
        );
      }
    }

    this.logger.log(`scanAndMarkNoShow finished: ${count} appointments marked as NO_SHOW`);
    return count;
  }

  @Cron('59 23 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async closeDayNoShowScan(): Promise<number> {
    return this.scanAndMarkNoShow();
  }

  /**
   * Cron 2: Quét dọn dẹp các slot giữ chỗ mồ côi (Orphaned Holding Slots)
   * Chạy định kỳ mỗi 5 phút.
   * Nếu slot trong DB có status = HOLDING nhưng Redis lock đã hết hạn (TTL <= 0 hoặc mất kết nối),
   * tự động hoàn trả slot về status = AVAILABLE.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupOrphanedHoldingSlots(): Promise<number> {
    this.logger.log('Running cleanupOrphanedHoldingSlots cron');

    if (!this.scheduleRepo || !this.redisService) {
      this.logger.warn('scheduleRepo or redisService is not initialized, skipping cleanupOrphanedHoldingSlots');
      return 0;
    }

    const holdingSlots = await this.scheduleRepo.find({
      where: {
        status: SlotStatus.HOLDING,
      },
    });

    let restoredCount = 0;

    for (const slot of holdingSlots) {
      const lockKey = `lock:doctor:${slot.doctorId}:slot:${slot.id}`;
      const lockHolder = await this.redisService.get(lockKey);
      const remainingTtl = await this.redisService.ttl(lockKey);

      // Nếu không còn key hoặc TTL âm (đã hết hạn)
      if (!lockHolder || remainingTtl <= 0) {
        slot.status = SlotStatus.AVAILABLE;
        await this.scheduleRepo.save(slot);
        restoredCount++;
        this.logger.warn(
          `Orphaned holding slot ${slot.id} of doctor ${slot.doctorId} restored to AVAILABLE (Redis lock expired or absent)`,
        );
      }
    }

    this.logger.log(`cleanupOrphanedHoldingSlots finished: ${restoredCount} slots restored`);
    return restoredCount;
  }

  /**
   * Cron 3: Quét tự động nhắc hẹn trước T-24h (Email) và T-2h (SMS) theo SRS-PAT-05
  * Chạy định kỳ mỗi 15 phút.
   */
  @Cron(`*/${REMINDER_SCAN_MINUTES} * * * *`, {
    timeZone: REMINDER_TIMEZONE,
    disabled: !REMINDERS_ENABLED,
  })
  async scanAndDispatchReminders(referenceTime: Date = new Date()): Promise<{ scheduled24h: number; scheduled2h: number }> {
    this.logger.log(`Running scanAndDispatchReminders cron at ${referenceTime.toISOString()}`);

    if (!this.appointmentRepo || !this.notificationRepo || !this.notificationProducerService) {
      this.logger.warn('Required dependencies are not initialized, skipping scanAndDispatchReminders');
      return { scheduled24h: 0, scheduled2h: 0 };
    }

    const upcomingAppointments = await this.appointmentRepo.find({
      where: {
        status: AppointmentStatus.CONFIRMED,
      },
      relations: ['patient', 'doctor', 'doctor.user', 'doctor.specialty', 'schedule'],
    });

    let scheduled24h = 0;
    let scheduled2h = 0;

    for (const appt of upcomingAppointments) {
      if (!appt.schedule || !appt.patient) {
        continue;
      }

      const scheduleDate = appt.schedule.date;
      const startTime = appt.schedule.startTime;
      const appointmentAt = localScheduleToInstant(scheduleDate, startTime);
      if (!appointmentAt || appt.status !== AppointmentStatus.CONFIRMED) continue;

      if (
        appt.patient.email &&
        appt.doctor?.user?.fullName &&
        isWithinReminderWindow(appointmentAt, referenceTime, 24, 60)
      ) {
        const didSchedule = await this.scheduleReminder(appt, 'REMINDER_24H', async (logId) => {
          await this.notificationProducerService!.enqueueAppointmentReminder24h({
            notificationLogId: logId,
            to: appt.patient.email!,
            patientName: appt.patient.fullName,
            appointmentCode: appt.appointmentCode,
            doctorName: appt.doctor!.user.fullName,
            date: scheduleDate,
            time: startTime,
            roomNumber: appt.doctor!.roomNumber,
            notes: 'Vui lòng mang theo CCCD, mã QR lịch hẹn và hồ sơ khám cũ. Chỉ nhịn ăn khi có chỉ định xét nghiệm hoặc nội soi.',
          });
          if (this.webPushService) {
            await this.webPushService.sendAppointmentReminder(
              appt.patientId,
              appt.appointmentCode,
              appt.doctor!.user.fullName,
              scheduleDate,
              startTime,
              '24H',
            ).catch(err => this.logger.warn(`Web push reminder 24h failed: ${err?.message || err}`));
          }
        });
        if (didSchedule) scheduled24h++;
      }

      if (
        appt.patient.phoneNumber &&
        appt.doctor?.user?.fullName &&
        isWithinReminderWindow(appointmentAt, referenceTime, 2, 15)
      ) {
        const didSchedule = await this.scheduleReminder(appt, 'REMINDER_2H', async (logId) => {
          await this.notificationProducerService!.enqueueAppointmentReminder2h({
            notificationLogId: logId,
            phoneNumber: appt.patient.phoneNumber!,
            patientName: appt.patient.fullName,
            appointmentCode: appt.appointmentCode,
            doctorName: appt.doctor!.user.fullName,
            time: startTime,
            roomNumber: appt.doctor!.roomNumber,
          });
          if (this.webPushService) {
            await this.webPushService.sendAppointmentReminder(
              appt.patientId,
              appt.appointmentCode,
              appt.doctor!.user.fullName,
              scheduleDate,
              startTime,
              '2H',
            ).catch(err => this.logger.warn(`Web push reminder 2h failed: ${err?.message || err}`));
          }
        });
        if (didSchedule) scheduled2h++;
      }
    }

    this.logger.log(`scanAndDispatchReminders finished: scheduled24h=${scheduled24h}, scheduled2h=${scheduled2h}`);
    return { scheduled24h, scheduled2h };
  }

  private async scheduleReminder(
    appointment: AppointmentEntity,
    notificationType: AppointmentReminderType,
    enqueue: (logId: string) => Promise<unknown>,
  ): Promise<boolean> {
    const channel = notificationType === 'REMINDER_24H' ? 'EMAIL' : 'SMS';
    const recipient = channel === 'EMAIL' ? appointment.patient.email! : appointment.patient.phoneNumber!;
    const scheduledAt = new Date(
      localScheduleToInstant(appointment.schedule.date, appointment.schedule.startTime)!.getTime() -
        (notificationType === 'REMINDER_24H' ? 24 : 2) * 60 * 60 * 1000,
    );
    const provider = channel === 'EMAIL' ? 'SMTP' : 'SMS_WEBHOOK';
    let notification: AppointmentNotificationEntity | null = await this.notificationRepo.findOne({
      where: { appointmentId: appointment.id, notificationType },
    });

    if (!notification) {
      notification = this.notificationRepo.create({
        appointmentId: appointment.id,
        notificationType,
        scheduledAt,
        provider,
        channel,
        recipient,
        subject: notificationType === 'REMINDER_24H' ? 'Nhắc lịch khám ngày mai' : 'Nhắc lịch khám sắp tới',
        message: notificationType === 'REMINDER_24H' ? 'PREPARATION_REMINDER' : 'TRAVEL_REMINDER',
        status: 'SCHEDULED',
        attempts: 0,
        failureReason: null,
        sentAt: null,
      });
      try {
        notification = await this.notificationRepo.save(notification);
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        notification = await this.notificationRepo.findOne({
          where: { appointmentId: appointment.id, notificationType },
        });
        return false;
      }
    } else if (notification.status === 'FAILED') {
      const retry = await this.notificationRepo.createQueryBuilder()
        .update(AppointmentNotificationEntity)
        .set({
          status: 'SCHEDULED',
          scheduledAt,
          failureReason: null,
          provider,
          updatedAt: new Date(),
        })
        .where('id = :id AND status = :status', { id: notification.id, status: 'FAILED' })
        .execute();
      if (!retry.affected) return false;
      notification.status = 'SCHEDULED';
      notification.scheduledAt = scheduledAt;
    } else {
      return false;
    }

    try {
      await enqueue(notification.id);
      return true;
    } catch {
      await this.notificationRepo.update(notification.id, {
        status: 'FAILED',
        failureReason: 'Notification queue submission failed.',
        updatedAt: new Date(),
      });
      this.logger.error(`Could not enqueue appointment reminder ${notification.id}.`);
      return false;
    }
  }
}
