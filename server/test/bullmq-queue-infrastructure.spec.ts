import './test-environment';
import { Test, TestingModule } from '@nestjs/testing';
import { QueueName, JobName } from '@shared/enums';
import {
  NotificationProducerService,
  DEFAULT_QUEUE_JOB_OPTIONS,
} from '../src/modules/notification/producers/notification-producer.service';
import { getBullMqConnectionOptions } from '../src/modules/queue/queue.module';
import { getQueueToken } from '@nestjs/bullmq';
import { MockBullQueue } from '../src/modules/notification/notification.module';

describe('BullMQ Queue Infrastructure & Producer (SRS Section 7.1)', () => {
  let producerService: NotificationProducerService;
  let mockEmailQueue: MockBullQueue;
  let mockSmsQueue: MockBullQueue;
  let mockPdfQueue: MockBullQueue;

  beforeEach(async () => {
    mockEmailQueue = new MockBullQueue(QueueName.EMAIL);
    mockSmsQueue = new MockBullQueue(QueueName.SMS);
    mockPdfQueue = new MockBullQueue(QueueName.PDF);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProducerService,
        { provide: getQueueToken(QueueName.EMAIL), useValue: mockEmailQueue },
        { provide: getQueueToken(QueueName.SMS), useValue: mockSmsQueue },
        { provide: getQueueToken(QueueName.PDF), useValue: mockPdfQueue },
      ],
    }).compile();

    producerService = module.get<NotificationProducerService>(NotificationProducerService);
  });

  describe('Connection Options & Configuration', () => {
    it('should configure maxRetriesPerRequest as null and retryStrategy for BullMQ', () => {
      const options = getBullMqConnectionOptions();
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.enableReadyCheck).toBe(false);
      expect(typeof options.retryStrategy).toBe('function');
      expect(options.retryStrategy(1)).toBe(200);
      expect(options.retryStrategy(6)).toBeNull(); // stops after 5 retries
    });

    it('should have standard retry and backoff options in DEFAULT_QUEUE_JOB_OPTIONS', () => {
      expect(DEFAULT_QUEUE_JOB_OPTIONS.attempts).toBe(3);
      expect(DEFAULT_QUEUE_JOB_OPTIONS.backoff.type).toBe('exponential');
      expect(DEFAULT_QUEUE_JOB_OPTIONS.backoff.delay).toBe(2000);
      expect(DEFAULT_QUEUE_JOB_OPTIONS.removeOnComplete).toBe(100);
    });
  });

  describe('Email Queue Producer', () => {
    it('should enqueue booking confirmation email with correct payload and job name', async () => {
      await producerService.enqueueBookingConfirmation({
        to: 'patient@example.com',
        patientName: 'Nguyen Van A',
        appointmentCode: 'APT-260923-0001',
        doctorName: 'BS. Tran B',
        specialtyName: 'Tim Mach',
        date: '2026-09-24',
        time: '09:00',
        roomNumber: 'P.102',
        totalAmount: 300000,
      });

      expect(mockEmailQueue.jobs.length).toBe(1);
      const job = mockEmailQueue.jobs[0];
      expect(job.name).toBe(JobName.EMAIL_SEND_BOOKING_CONFIRMATION);
      expect(job.data.appointmentCode).toBe('APT-260923-0001');
      expect(job.data.to).toBe('patient@example.com');
      expect(job.opts.attempts).toBe(3);
    });

    it('should enqueue account activation email', async () => {
      await producerService.enqueueAccountActivation({
        to: 'newuser@example.com',
        fullName: 'Le Thi C',
        activationLink: 'https://ehealth.vn/activate?token=abc',
      });

      expect(mockEmailQueue.jobs.length).toBe(1);
      const job = mockEmailQueue.jobs[0];
      expect(job.name).toBe(JobName.EMAIL_SEND_ACCOUNT_ACTIVATION);
      expect(job.data.fullName).toBe('Le Thi C');
    });

    it('should enqueue 24h appointment reminder email', async () => {
      await producerService.enqueueAppointmentReminder24h({
        to: 'patient@example.com',
        patientName: 'Nguyen Van A',
        appointmentCode: 'APT-260923-0002',
        doctorName: 'BS. Pham D',
        date: '2026-09-25',
        time: '14:00',
        roomNumber: 'P.205',
        notes: 'Nhin an sang truoc xet nghiem',
      });

      expect(mockEmailQueue.jobs.length).toBe(1);
      const job = mockEmailQueue.jobs[0];
      expect(job.name).toBe(JobName.EMAIL_SEND_REMINDER_24H);
      expect(job.data.notes).toContain('Nhin an sang');
    });
  });

  describe('SMS Queue Producer', () => {
    it('should enqueue OTP SMS with limited retry attempts to prevent replay', async () => {
      await producerService.enqueueOtp({
        phoneNumber: '0912345678',
        otp: '123456',
      });

      expect(mockSmsQueue.jobs.length).toBe(1);
      const job = mockSmsQueue.jobs[0];
      expect(job.name).toBe(JobName.SMS_SEND_OTP);
      expect(job.data.otp).toBe('123456');
      expect(job.opts.attempts).toBe(2);
    });

    it('should enqueue 2h appointment reminder SMS', async () => {
      await producerService.enqueueAppointmentReminder2h({
        phoneNumber: '0987654321',
        patientName: 'Tran Van E',
        appointmentCode: 'APT-260923-0003',
        doctorName: 'BS. Hoang F',
        time: '10:30',
        roomNumber: 'P.301',
      });

      expect(mockSmsQueue.jobs.length).toBe(1);
      const job = mockSmsQueue.jobs[0];
      expect(job.name).toBe(JobName.SMS_SEND_REMINDER_2H);
      expect(job.data.appointmentCode).toBe('APT-260923-0003');
    });
  });

  describe('PDF Queue Producer', () => {
    it('should enqueue prescription PDF generation job', async () => {
      await producerService.enqueuePrescriptionPdf({
        prescriptionCode: 'RX-260923-0001',
        appointmentCode: 'APT-260923-0001',
        patientName: 'Nguyen Van A',
        doctorName: 'BS. Tran B',
        diagnosis: 'Tang huyet ap vo can',
        icd10Code: 'I10',
        medicines: [
          {
            medicineName: 'Amlodipine 5mg',
            quantity: 30,
            usageInstruction: 'Uong 1 vien buoi sang sau an',
          },
        ],
        createdAt: '2026-09-23',
      });

      expect(mockPdfQueue.jobs.length).toBe(1);
      const job = mockPdfQueue.jobs[0];
      expect(job.name).toBe(JobName.PDF_GENERATE_PRESCRIPTION);
      expect(job.data.prescriptionCode).toBe('RX-260923-0001');
    });

    it('should enqueue EMR PDF generation job', async () => {
      await producerService.enqueueEmrPdf({
        recordCode: 'EMR-260923-0001',
        appointmentCode: 'APT-260923-0001',
        patientName: 'Nguyen Van A',
        doctorName: 'BS. Tran B',
        diagnosis: 'Viem phoi cap',
        icd10Code: 'J18.9',
        createdAt: '2026-09-23',
      });

      expect(mockPdfQueue.jobs.length).toBe(1);
      const job = mockPdfQueue.jobs[0];
      expect(job.name).toBe(JobName.PDF_GENERATE_EMR);
      expect(job.data.recordCode).toBe('EMR-260923-0001');
    });
  });
});
