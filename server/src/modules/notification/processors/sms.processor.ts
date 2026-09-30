import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName, JobName } from '@shared/enums';
import {
  SmsOtpPayload,
  SmsAppointmentReminder2hPayload,
  SmsAppointmentCancellationPayload,
} from '@shared/interfaces';
import { SmsSenderService } from '../services/sms-sender.service';
import { AppointmentReminderDeliveryService } from '../services/appointment-reminder-delivery.service';

@Processor(QueueName.SMS)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    private readonly smsSenderService: SmsSenderService,
    private readonly reminderDelivery: AppointmentReminderDeliveryService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing SMS job: ${job.name} [ID: ${job.id}]`);

    switch (job.name) {
      case JobName.SMS_SEND_OTP: {
        const payload = job.data as SmsOtpPayload;
        await this.smsSenderService.sendOtp(payload);
        return { success: true };
      }

      case JobName.SMS_SEND_REMINDER_2H: {
        const payload = job.data as SmsAppointmentReminder2hPayload;
        if (payload.notificationLogId) {
          await this.reminderDelivery.deliver(
            payload.notificationLogId,
            'REMINDER_2H',
            'SMS_WEBHOOK',
            () => this.smsSenderService.sendAppointmentReminder2h(payload),
          );
        } else {
          await this.smsSenderService.sendAppointmentReminder2h(payload);
        }
        return { success: true, appointmentCode: payload.appointmentCode };
      }

      case JobName.SMS_SEND_APPOINTMENT_CANCELLATION: {
        const payload = job.data as SmsAppointmentCancellationPayload;
        await this.smsSenderService.sendAppointmentCancellation(payload);
        return { success: true, appointmentCode: payload.appointmentCode };
      }

      default:
        this.logger.warn(`Unknown job name in ${QueueName.SMS}: ${job.name}`);
        return { success: false, reason: 'UNKNOWN_JOB_NAME' };
    }
  }
}
