import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName, JobName } from '@shared/enums';
import {
  EmailBookingConfirmationPayload,
  EmailAccountActivationPayload,
  EmailAppointmentReminder24hPayload,
} from '@shared/interfaces';
import { EmailSenderService } from '../services/email-sender.service';

@Processor(QueueName.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailSenderService: EmailSenderService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing email job: ${job.name} [ID: ${job.id}]`);

    switch (job.name) {
      case JobName.EMAIL_SEND_BOOKING_CONFIRMATION: {
        const payload = job.data as EmailBookingConfirmationPayload;
        await this.emailSenderService.sendBookingConfirmation(payload);
        return { success: true, appointmentCode: payload.appointmentCode };
      }

      case JobName.EMAIL_SEND_ACCOUNT_ACTIVATION: {
        const payload = job.data as EmailAccountActivationPayload;
        await this.emailSenderService.sendAccountActivation(payload);
        return { success: true, to: payload.to };
      }

      case JobName.EMAIL_SEND_REMINDER_24H: {
        const payload = job.data as EmailAppointmentReminder24hPayload;
        await this.emailSenderService.sendAppointmentReminder24h(payload);
        return { success: true, appointmentCode: payload.appointmentCode };
      }

      default:
        this.logger.warn(`Unknown job name in ${QueueName.EMAIL}: ${job.name}`);
        return { success: false, reason: 'UNKNOWN_JOB_NAME' };
    }
  }
}
