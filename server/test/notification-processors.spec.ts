import './test-environment';
import { Test, TestingModule } from '@nestjs/testing';
import { QueueName, JobName } from '@shared/enums';
import { EmailProcessor } from '../src/modules/notification/processors/email.processor';
import { SmsProcessor } from '../src/modules/notification/processors/sms.processor';
import { PdfProcessor } from '../src/modules/notification/processors/pdf.processor';
import { EmailSenderService } from '../src/modules/notification/services/email-sender.service';
import { SmsSenderService } from '../src/modules/notification/services/sms-sender.service';
import { PdfGeneratorService } from '../src/modules/notification/services/pdf-generator.service';

describe('Notification Queue Processors (Workers)', () => {
  let emailProcessor: EmailProcessor;
  let smsProcessor: SmsProcessor;
  let pdfProcessor: PdfProcessor;
  let emailSenderService: EmailSenderService;
  let smsSenderService: SmsSenderService;
  let pdfGeneratorService: PdfGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        SmsProcessor,
        PdfProcessor,
        {
          provide: EmailSenderService,
          useValue: {
            sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
            sendAccountActivation: jest.fn().mockResolvedValue(undefined),
            sendAppointmentReminder24h: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SmsSenderService,
          useValue: {
            sendOtp: jest.fn().mockResolvedValue(undefined),
            sendAppointmentReminder2h: jest.fn().mockResolvedValue(undefined),
          },
        },
        PdfGeneratorService, // Use real generator to test PDF and QR code creation
      ],
    }).compile();

    emailProcessor = module.get<EmailProcessor>(EmailProcessor);
    smsProcessor = module.get<SmsProcessor>(SmsProcessor);
    pdfProcessor = module.get<PdfProcessor>(PdfProcessor);
    emailSenderService = module.get<EmailSenderService>(EmailSenderService);
    smsSenderService = module.get<SmsSenderService>(SmsSenderService);
    pdfGeneratorService = module.get<PdfGeneratorService>(PdfGeneratorService);
  });

  describe('EmailProcessor (email-queue worker)', () => {
    it('should process EMAIL_SEND_BOOKING_CONFIRMATION job successfully', async () => {
      const payload = {
        to: 'patient@example.com',
        patientName: 'Le Thi Hoa',
        appointmentCode: 'APT-260923-0010',
        doctorName: 'BS. Le Van B',
        date: '2026-09-24',
        time: '08:30',
      };

      const result = await emailProcessor.process({
        id: '1',
        name: JobName.EMAIL_SEND_BOOKING_CONFIRMATION,
        data: payload,
      } as any);

      expect(emailSenderService.sendBookingConfirmation).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true, appointmentCode: 'APT-260923-0010' });
    });

    it('should process EMAIL_SEND_ACCOUNT_ACTIVATION job', async () => {
      const payload = {
        to: 'user@example.com',
        fullName: 'Tran Van Nam',
        activationLink: 'https://ehealth.vn/verify?code=xyz',
      };

      const result = await emailProcessor.process({
        id: '2',
        name: JobName.EMAIL_SEND_ACCOUNT_ACTIVATION,
        data: payload,
      } as any);

      expect(emailSenderService.sendAccountActivation).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true, to: 'user@example.com' });
    });

    it('should process EMAIL_SEND_REMINDER_24H job', async () => {
      const payload = {
        to: 'patient@example.com',
        patientName: 'Le Thi Hoa',
        appointmentCode: 'APT-260923-0010',
        doctorName: 'BS. Le Van B',
        date: '2026-09-25',
        time: '08:30',
        notes: 'Vui long nhin an sang',
      };

      const result = await emailProcessor.process({
        id: '3',
        name: JobName.EMAIL_SEND_REMINDER_24H,
        data: payload,
      } as any);

      expect(emailSenderService.sendAppointmentReminder24h).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true, appointmentCode: 'APT-260923-0010' });
    });

    it('should handle unknown job gracefully without throwing', async () => {
      const result = await emailProcessor.process({
        id: '99',
        name: 'unknown-job',
        data: {},
      } as any);

      expect(result).toEqual({ success: false, reason: 'UNKNOWN_JOB_NAME' });
    });
  });

  describe('SmsProcessor (sms-queue worker)', () => {
    it('should process SMS_SEND_OTP job', async () => {
      const payload = {
        phoneNumber: '0901234567',
        otp: '889900',
      };

      const result = await smsProcessor.process({
        id: '10',
        name: JobName.SMS_SEND_OTP,
        data: payload,
      } as any);

      expect(smsSenderService.sendOtp).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true });
    });

    it('should process SMS_SEND_REMINDER_2H job', async () => {
      const payload = {
        phoneNumber: '0901234567',
        patientName: 'Pham Van Dung',
        appointmentCode: 'APT-260923-0015',
        doctorName: 'BS. Ngo C',
        time: '14:00',
        roomNumber: 'P.201',
      };

      const result = await smsProcessor.process({
        id: '11',
        name: JobName.SMS_SEND_REMINDER_2H,
        data: payload,
      } as any);

      expect(smsSenderService.sendAppointmentReminder2h).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true, appointmentCode: 'APT-260923-0015' });
    });

    it('should handle unknown SMS job gracefully', async () => {
      const result = await smsProcessor.process({
        id: '99',
        name: 'unknown-sms-job',
        data: {},
      } as any);

      expect(result).toEqual({ success: false, reason: 'UNKNOWN_JOB_NAME' });
    });
  });

  describe('PdfProcessor & PdfGeneratorService (pdf-queue worker)', () => {
    it('should generate Prescription PDF with embedded QR code and valid PDF structure', async () => {
      const payload = {
        prescriptionCode: 'RX-2026-0001',
        appointmentCode: 'APT-2026-0001',
        patientName: 'Nguyen Van Binh',
        patientGender: 'Nam',
        patientDob: '1985-05-15',
        patientPhone: '0912345678',
        doctorName: 'Le Thi Mai',
        doctorLicense: 'CCHN-012345/HCM',
        diagnosis: 'Viêm họng cấp tính',
        icd10Code: 'J02.9',
        medicines: [
          {
            medicineName: 'Amoxicillin 500mg',
            activeIngredient: 'Amoxicillin',
            unit: 'viên',
            quantity: 21,
            dosageMorning: 1,
            dosageNoon: 1,
            dosageAfternoon: 0,
            dosageNight: 1,
            usageInstruction: 'Uống sau ăn no',
          },
          {
            medicineName: 'Paracetamol 500mg',
            activeIngredient: 'Paracetamol',
            unit: 'viên',
            quantity: 10,
            dosageMorning: 1,
            dosageNoon: 0,
            dosageAfternoon: 0,
            dosageNight: 1,
            usageInstruction: 'Uống khi sốt > 38.5 độ',
          },
        ],
        doctorAdvice: 'Uống nhiều nước ấm, nghỉ ngơi, tái khám sau 5 ngày nếu không thuyên giảm.',
        createdAt: '23/09/2026',
        verificationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const result = await pdfProcessor.process({
        id: '20',
        name: JobName.PDF_GENERATE_PRESCRIPTION,
        data: payload,
      } as any);

      expect(result.success).toBe(true);
      expect(result.prescriptionCode).toBe('RX-2026-0001');
      expect(result.byteLength).toBeGreaterThan(1000); // Valid PDF document size
      expect(typeof result.base64).toBe('string');

      // Verify PDF magic header bytes (%PDF-)
      const pdfBuffer = Buffer.from(result.base64, 'base64');
      const header = pdfBuffer.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    }, 15000);

    it('should generate EMR Medical Record PDF with vital signs and QR code', async () => {
      const payload = {
        recordCode: 'EMR-2026-0099',
        appointmentCode: 'APT-2026-0099',
        patientName: 'Hoang Thi Thu',
        patientGender: 'Nu',
        patientDob: '1990-12-01',
        doctorName: 'Nguyen Van An',
        diagnosis: 'Rối loạn tiền đình',
        icd10Code: 'H81.9',
        symptoms: 'Chóng mặt, buồn nôn khi thay đổi tư thế, ù tai nhẹ.',
        clinicalNotes: 'Tiền sử tăng huyết áp 2 năm. Nghiệm pháp Dix-Hallpike dương tính.',
        vitalSigns: {
          heightCm: 160,
          weightKg: 52,
          bmi: 20.31,
          bloodPressure: '120/80',
          heartRateBpm: 76,
          temperatureC: 36.8,
          spo2Percent: 99,
        },
        createdAt: '23/09/2026 14:30',
      };

      const result = await pdfProcessor.process({
        id: '21',
        name: JobName.PDF_GENERATE_EMR,
        data: payload,
      } as any);

      expect(result.success).toBe(true);
      expect(result.recordCode).toBe('EMR-2026-0099');
      expect(result.byteLength).toBeGreaterThan(1000);

      const pdfBuffer = Buffer.from(result.base64, 'base64');
      const header = pdfBuffer.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    }, 15000);

    it('should handle unknown PDF job gracefully', async () => {
      const result = await pdfProcessor.process({
        id: '99',
        name: 'unknown-pdf-job',
        data: {},
      } as any);

      expect(result).toEqual({ success: false, reason: 'UNKNOWN_JOB_NAME' });
    });
  });
});
