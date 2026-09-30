import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { AppointmentNotificationEntity, AppointmentReminderType } from '../../../database/entities/appointment-notification.entity';

@Injectable()
export class AppointmentReminderDeliveryService {
  private readonly logger = new Logger(AppointmentReminderDeliveryService.name);

  constructor(private readonly dataSource: DataSource) {}

  async deliver(
    logId: string,
    notificationType: AppointmentReminderType,
    provider: string,
    send: () => Promise<void>,
  ): Promise<boolean> {
    const repository = this.dataSource.getRepository(AppointmentNotificationEntity);
    const log = await repository.findOne({
      where: { id: logId },
      relations: { appointment: true },
    });
    if (!log || log.notificationType !== notificationType) {
      throw new Error('Reminder delivery log does not match the queued reminder.');
    }
    if (log.status === 'SENT') return false;

    if (log.appointment?.status !== AppointmentStatus.CONFIRMED) {
      log.status = 'FAILED';
      log.failureReason = 'Appointment is no longer eligible for reminders.';
      log.provider = provider;
      await repository.save(log);
      return false;
    }

    log.status = 'PROCESSING';
    log.provider = provider;
    log.attempts += 1;
    log.failureReason = null;
    await repository.save(log);

    try {
      await send();
      log.status = 'SENT';
      log.sentAt = new Date();
      await repository.save(log);
      return true;
    } catch {
      log.status = 'FAILED';
      log.failureReason = 'Notification provider delivery failed.';
      await repository.save(log);
      this.logger.error(`Reminder delivery failed for notification log ${log.id}.`);
      throw new Error('Reminder provider delivery failed.');
    }
  }
}