import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName, JobName } from '@shared/enums';
import {
  EmailBookingConfirmationPayload,
  EmailAccountActivationPayload,
  EmailAppointmentReminder24hPayload,
  EmailAppointmentCancellationPayload,
  SmsOtpPayload,
  SmsAppointmentReminder2hPayload,
  SmsAppointmentCancellationPayload,
  PrescriptionPdfPayload,
  MedicalRecordPdfPayload,
} from '@shared/interfaces';

export const DEFAULT_QUEUE_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

@Injectable()
export class NotificationProducerService {
  private readonly logger = new Logger(NotificationProducerService.name);

  constructor(
    @InjectQueue(QueueName.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QueueName.SMS) private readonly smsQueue: Queue,
    @InjectQueue(QueueName.PDF) private readonly pdfQueue: Queue,
  ) {}

  async enqueueBookingConfirmation(payload: EmailBookingConfirmationPayload) {
    this.logger.log(`Enqueuing booking confirmation email for appt: ${payload.appointmentCode}`);
    return this.emailQueue.add(
      JobName.EMAIL_SEND_BOOKING_CONFIRMATION,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueAccountActivation(payload: EmailAccountActivationPayload) {
    this.logger.log(`Enqueuing account activation email for: ${payload.to}`);
    return this.emailQueue.add(
      JobName.EMAIL_SEND_ACCOUNT_ACTIVATION,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueAppointmentReminder24h(payload: EmailAppointmentReminder24hPayload) {
    this.logger.log(`Enqueuing 24h reminder email for appt: ${payload.appointmentCode}`);
    return this.emailQueue.add(
      JobName.EMAIL_SEND_REMINDER_24H,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueAppointmentCancellationEmail(payload: EmailAppointmentCancellationPayload) {
    this.logger.log('Enqueuing appointment cancellation email for appt: ' + payload.appointmentCode);
    return this.emailQueue.add(
      JobName.EMAIL_SEND_APPOINTMENT_CANCELLATION,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueOtp(payload: SmsOtpPayload) {
    // Mask phone number for security in logs
    const masked = payload.phoneNumber ? `${payload.phoneNumber.slice(0, 3)}****${payload.phoneNumber.slice(-3)}` : '***';
    this.logger.log(`Enqueuing OTP SMS for: ${masked}`);
    return this.smsQueue.add(
      JobName.SMS_SEND_OTP,
      payload,
      {
        ...DEFAULT_QUEUE_JOB_OPTIONS,
        attempts: 2, // OTP retry only twice within validity
      },
    );
  }

  async enqueueAppointmentReminder2h(payload: SmsAppointmentReminder2hPayload) {
    this.logger.log(`Enqueuing 2h reminder SMS for appt: ${payload.appointmentCode}`);
    return this.smsQueue.add(
      JobName.SMS_SEND_REMINDER_2H,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueAppointmentCancellationSms(payload: SmsAppointmentCancellationPayload) {
    this.logger.log('Enqueuing appointment cancellation SMS for appt: ' + payload.appointmentCode);
    return this.smsQueue.add(
      JobName.SMS_SEND_APPOINTMENT_CANCELLATION,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueuePrescriptionPdf(payload: PrescriptionPdfPayload) {
    this.logger.log(`Enqueuing prescription PDF generation for: ${payload.prescriptionCode}`);
    return this.pdfQueue.add(
      JobName.PDF_GENERATE_PRESCRIPTION,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueEmrPdf(payload: MedicalRecordPdfPayload) {
    this.logger.log(`Enqueuing EMR PDF generation for: ${payload.recordCode}`);
    return this.pdfQueue.add(
      JobName.PDF_GENERATE_EMR,
      payload,
      DEFAULT_QUEUE_JOB_OPTIONS,
    );
  }
}
