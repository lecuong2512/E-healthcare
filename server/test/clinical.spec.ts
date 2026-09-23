import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Role, AppointmentStatus } from '@shared/enums';

import { ClinicalService } from '../src/modules/clinical/clinical.service';
import { Icd10Service } from '../src/modules/clinical/icd10/icd10.service';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  VitalSignsDto,
  CreatePrescriptionItemDto,
  PrescriptionSafetyCheckDto,
} from '../src/modules/clinical/dto';

describe('Card 3.3: Clinical Module (EMR, ICD-10, e-Prescription)', () => {
  let service: ClinicalService;
  let icd10Service: Icd10Service;

  // Mock repositories and dataSource
  let mockMedicalRecordRepo: any;
  let mockPrescriptionRepo: any;
  let mockPrescriptionItemRepo: any;
  let mockAppointmentRepo: any;
  let mockDoctorRepo: any;
  let mockPhrRepo: any;
  let mockDataSource: any;
  let mockManager: any;

  const DOCTOR_USER_ID = 'u-doctor-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_USER_ID = 'u-doctor-2222-2222-2222-222222222222';
  const DOCTOR_ID = 'd-doctor-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_ID = 'd-doctor-2222-2222-2222-222222222222';
  const PATIENT_ID = 'u-patient-1111-1111-1111-111111111111';
  const OTHER_PATIENT_ID = 'u-patient-2222-2222-2222-222222222222';
  const APPOINTMENT_ID = 'a-appoint-1111-1111-1111-111111111111';
  const RECORD_ID = 'm-record-1111-1111-1111-111111111111';

  beforeEach(() => {
    icd10Service = new Icd10Service();

    mockMedicalRecordRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: RECORD_ID, ...data })),
      save: jest.fn(async (data) => ({ id: RECORD_ID, ...data })),
    };

    mockPrescriptionRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: 'p-1', ...data })),
      save: jest.fn(async (data) => ({ id: 'p-1', ...data })),
    };

    mockPrescriptionItemRepo = {
      create: jest.fn((data) => ({ id: 'pi-1', ...data })),
      save: jest.fn(async (data) => (Array.isArray(data) ? data : [data])),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockAppointmentRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (data) => data),
    };

    mockDoctorRepo = {
      findOne: jest.fn(async ({ where }) => {
        if (where.userId === DOCTOR_USER_ID) {
          return { id: DOCTOR_ID, userId: DOCTOR_USER_ID };
        }
        if (where.userId === OTHER_DOCTOR_USER_ID) {
          return { id: OTHER_DOCTOR_ID, userId: OTHER_DOCTOR_USER_ID };
        }
        return null;
      }),
    };

    mockPhrRepo = {
      findOne: jest.fn(async ({ where }) => {
        if (where.userId === PATIENT_ID) {
          return {
            userId: PATIENT_ID,
            allergies: 'Penicillin, Aspirin',
            chronicDiseases: 'Tăng huyết áp, Đái tháo đường',
          };
        }
        return null;
      }),
    };

    mockManager = {
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name || '';
        if (name.includes('MedicalRecord')) return mockMedicalRecordRepo;
        if (name.includes('PrescriptionItem')) return mockPrescriptionItemRepo;
        if (name.includes('Prescription')) return mockPrescriptionRepo;
        if (name.includes('Appointment')) return mockAppointmentRepo;
        if (name.includes('Doctor')) return mockDoctorRepo;
        if (name.includes('PersonalHealthProfile')) return mockPhrRepo;
        return {};
      }),
    };

    mockDataSource = {
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name || '';
        if (name.includes('MedicalRecord')) return mockMedicalRecordRepo;
        if (name.includes('PrescriptionItem')) return mockPrescriptionItemRepo;
        if (name.includes('Prescription')) return mockPrescriptionRepo;
        if (name.includes('Appointment')) return mockAppointmentRepo;
        if (name.includes('Doctor')) return mockDoctorRepo;
        if (name.includes('PersonalHealthProfile')) return mockPhrRepo;
        return {};
      }),
      transaction: jest.fn(async (work: (mgr: EntityManager) => Promise<any>) =>
        work(mockManager),
      ),
    } as unknown as DataSource;

    service = new ClinicalService(mockDataSource, icd10Service);
  });

  describe('1. BMI Calculation & Vital Signs', () => {
    it('calculates BMI correctly with formula weight / (heightInM)^2', () => {
      const bmi1 = service.calculateBmi(70, 175);
      expect(bmi1).toBe(22.86);

      const bmi2 = service.calculateBmi(60, 165);
      expect(bmi2).toBe(22.04);

      const bmi3 = service.calculateBmi(80, 180);
      expect(bmi3).toBe(24.69);
    });

    it('rejects invalid height and weight (<= 0)', () => {
      expect(() => service.calculateBmi(0, 170)).toThrow(BadRequestException);
      expect(() => service.calculateBmi(70, -10)).toThrow(BadRequestException);
    });

    it('validates VitalSignsDto correctly and rejects out-of-range values', async () => {
      const invalidVitals = plainToInstance(VitalSignsDto, {
        bloodPressure: 'invalid_format',
        pulse: 10,
        temperature: 55,
        respiratoryRate: 2,
        weight: 0,
        height: 10,
      });

      const errors = await validate(invalidVitals);
      expect(errors.length).toBeGreaterThanOrEqual(5);

      const validVitals = plainToInstance(VitalSignsDto, {
        bloodPressure: '120/80',
        pulse: 75,
        temperature: 36.8,
        respiratoryRate: 18,
        weight: 68,
        height: 172,
      });
      const validErrors = await validate(validVitals);
      expect(validErrors.length).toBe(0);
    });
  });

  describe('2. ICD-10 Search', () => {
    it('searches ICD-10 by code case-insensitively', async () => {
      const resultsJ00 = await icd10Service.search('j00');
      expect(resultsJ00.length).toBeGreaterThan(0);
      expect(resultsJ00[0].code).toBe('J00');

      const resultsI10 = await icd10Service.search('I10');
      expect(resultsI10.length).toBeGreaterThan(0);
      expect(resultsI10[0].code).toBe('I10');
    });

    it('searches ICD-10 by Vietnamese disease name with and without diacritics', async () => {
      const resultsWithAccents = await icd10Service.search('Viêm mũi họng');
      expect(resultsWithAccents.length).toBeGreaterThan(0);
      expect(resultsWithAccents[0].code).toBe('J00');

      const resultsWithoutAccents = await icd10Service.search('tang huyet ap');
      expect(resultsWithoutAccents.length).toBeGreaterThan(0);
      expect(resultsWithoutAccents.some((r) => r.code === 'I10')).toBe(true);
    });

    it('identifies chronic disease codes', () => {
      expect(icd10Service.isChronicCode('I10')).toBe(true);
      expect(icd10Service.isChronicCode('E11')).toBe(true);
      expect(icd10Service.isChronicCode('J45')).toBe(true);
      expect(icd10Service.isChronicCode('J00')).toBe(false);
      expect(icd10Service.isChronicCode('K29')).toBe(false);
    });
  });

  describe('3. Drug Safety: Allergy Warnings', () => {
    it('returns warning popup data when prescribed medicine matches patient PHR allergy', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amoxicillin (nhóm Penicillin)',
          activeIngredient: 'Amoxicillin trihydrate',
          dosageMorning: '1',
          dosageNoon: null,
          dosageAfternoon: null,
          dosageNight: '1',
          totalQuantity: 20,
          unit: 'viên',
          usageInstructions: 'Uống sau ăn',
        },
      ];

      const safetyResult = await service.checkPrescriptionSafety(
        PATIENT_ID,
        items,
        'J00',
      );

      expect(safetyResult.hasWarning).toBe(true);
      expect(safetyResult.warnings.length).toBe(1);
      expect(safetyResult.warnings[0].medicineName).toBe(
        'Amoxicillin (nhóm Penicillin)',
      );
      expect(safetyResult.warnings[0].matchedAllergy).toBe('penicillin');
      expect(safetyResult.warnings[0].warningMessage).toContain(
        'CẢNH BÁO: Bệnh nhân có tiền sử dị ứng với "penicillin"',
      );
    });

    it('returns no warning when prescribed medicine does not match any allergy', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Paracetamol 500mg',
          activeIngredient: 'Paracetamol',
          dosageMorning: '1',
          dosageNoon: null,
          dosageAfternoon: null,
          dosageNight: '1',
          totalQuantity: 10,
          unit: 'viên',
          usageInstructions: 'Uống khi sốt > 38.5C',
        },
      ];

      const safetyResult = await service.checkPrescriptionSafety(
        PATIENT_ID,
        items,
        'J00',
      );

      expect(safetyResult.hasWarning).toBe(false);
      expect(safetyResult.warnings.length).toBe(0);
    });

    it('enforces doctor authorization on safety-check endpoint and rejects unauthorized doctor', async () => {
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID, // assigned to DOCTOR_ID
      });

      const dto: PrescriptionSafetyCheckDto = {
        appointmentId: APPOINTMENT_ID,
        items: [
          {
            medicineName: 'Paracetamol',
            dosageMorning: '1',
            totalQuantity: 10,
            unit: 'viên',
          },
        ],
      };

      // OTHER_DOCTOR should be rejected
      await expect(
        service.checkPrescriptionSafetyEndpoint(OTHER_DOCTOR_USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);

      // DOCTOR should succeed
      const result = await service.checkPrescriptionSafetyEndpoint(
        DOCTOR_USER_ID,
        dto,
      );
      expect(result.hasWarning).toBe(false);
    });

    it('Doctor A safety-check Patient B not belonging to Doctor A appointment => 403 Forbidden', async () => {
      // Appointment belongs to Doctor B (OTHER_DOCTOR_ID) and Patient B (OTHER_PATIENT_ID)
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: 'a-appoint-doctor-b',
        patientId: OTHER_PATIENT_ID,
        doctorId: OTHER_DOCTOR_ID,
      });

      const dto: PrescriptionSafetyCheckDto = {
        appointmentId: 'a-appoint-doctor-b',
        items: [
          {
            medicineName: 'Amoxicillin 500mg',
            dosageMorning: '1',
            totalQuantity: 14,
            unit: 'viên',
          },
        ],
      };

      // Doctor A attempts safety-check on Doctor B's appointment => 403 Forbidden
      await expect(
        service.checkPrescriptionSafetyEndpoint(DOCTOR_USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Chronic Disease 30-Day Prescription Limit', () => {
    it('rejects prescription exceeding 30 days for chronic patient with BadRequestException', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine',
          dosageMorning: '1',
          dosageNoon: null,
          dosageAfternoon: null,
          dosageNight: '1',
          totalQuantity: 70,
          unit: 'viên',
          usageInstructions: 'Uống buổi sáng và tối',
        },
      ];

      await expect(
        service.checkPrescriptionSafety(PATIENT_ID, items, 'I10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts prescription <= 30 days for chronic patient', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine',
          dosageMorning: '1',
          dosageNoon: null,
          dosageAfternoon: null,
          dosageNight: '1',
          totalQuantity: 60,
          unit: 'viên',
          usageInstructions: 'Uống buổi sáng và tối',
        },
      ];

      const result = await service.checkPrescriptionSafety(
        PATIENT_ID,
        items,
        'I10',
      );
      expect(result.hasWarning).toBe(false);
    });

    it('rejects chronic prescription when dosage cannot be determined and durationDays is missing (prevents silent bypass)', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine',
          dosageMorning: 'khi cần',
          dosageNoon: 'theo chỉ định',
          totalQuantity: 60,
          unit: 'viên',
        },
      ];

      // Must not silently bypass 30-day rule: throws BadRequestException
      await expect(
        service.checkPrescriptionSafety(PATIENT_ID, items, 'I10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts chronic prescription with unparseable text when explicit durationDays <= 30 is provided', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine',
          dosageMorning: 'theo hướng dẫn',
          totalQuantity: 30,
          unit: 'viên',
          durationDays: 25,
        },
      ];

      const result = await service.checkPrescriptionSafety(
        PATIENT_ID,
        items,
        'I10',
      );
      expect(result.hasWarning).toBe(false);
    });

    it('rejects chronic prescription when explicit durationDays > 30', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine',
          dosageMorning: '1',
          totalQuantity: 35,
          unit: 'viên',
          durationDays: 35,
        },
      ];

      await expect(
        service.checkPrescriptionSafety(PATIENT_ID, items, 'I10'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. EMR Draft, Update, and Appointment Lifecycle', () => {
    it('creates draft EMR with automatically calculated BMI when appointment is IN_CONSULTATION', async () => {
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        status: AppointmentStatus.IN_CONSULTATION,
      });
      mockMedicalRecordRepo.findOne.mockResolvedValue(null);

      const dto: CreateMedicalRecordDto = {
        appointmentId: APPOINTMENT_ID,
        vitalSigns: {
          bloodPressure: '120/80',
          pulse: 72,
          temperature: 36.5,
          respiratoryRate: 16,
          weight: 70,
          height: 175,
        },
        clinicalNotes: 'Bệnh nhân tỉnh táo, họng đỏ nhẹ.',
        icd10PrimaryCode: 'J00',
        icd10SecondaryCodes: null,
        doctorAdvice: 'Uống nhiều nước ấm, nghỉ ngơi.',
        followUpDate: '2026-09-30',
      };

      const result = await service.createMedicalRecord(DOCTOR_USER_ID, dto);

      expect(result.vitalSigns.bmi).toBe(22.86);
      expect(result.icd10PrimaryCode).toBe('J00');
      expect(result.isLocked).toBe(false);
      expect(result.completedAt).toBeNull();
      expect(mockMedicalRecordRepo.save).toHaveBeenCalled();
    });

    it('strictly rejects creating EMR when appointment is in CHECKED_IN status (SRS-DOC-03 precondition)', async () => {
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        status: AppointmentStatus.CHECKED_IN, // Not yet in consultation
      });

      const dto: CreateMedicalRecordDto = {
        appointmentId: APPOINTMENT_ID,
        vitalSigns: {
          bloodPressure: '120/80',
          pulse: 72,
          temperature: 36.5,
          respiratoryRate: 16,
          weight: 70,
          height: 175,
        },
        clinicalNotes: 'Test',
        icd10PrimaryCode: 'J00',
      };

      await expect(
        service.createMedicalRecord(DOCTOR_USER_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creating EMR if unauthorized doctor attempts to create for another doctor appointment', async () => {
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        doctorId: OTHER_DOCTOR_ID,
        status: AppointmentStatus.IN_CONSULTATION,
      });

      const dto: CreateMedicalRecordDto = {
        appointmentId: APPOINTMENT_ID,
        vitalSigns: {
          bloodPressure: '120/80',
          pulse: 72,
          temperature: 36.5,
          respiratoryRate: 16,
          weight: 70,
          height: 175,
        },
        clinicalNotes: 'Test notes',
        icd10PrimaryCode: 'J00',
      };

      await expect(
        service.createMedicalRecord(DOCTOR_USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects creating duplicate EMR for the same appointment', async () => {
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        status: AppointmentStatus.IN_CONSULTATION,
      });
      mockMedicalRecordRepo.findOne.mockResolvedValue({ id: RECORD_ID });

      const dto: CreateMedicalRecordDto = {
        appointmentId: APPOINTMENT_ID,
        vitalSigns: {
          bloodPressure: '120/80',
          pulse: 72,
          temperature: 36.5,
          respiratoryRate: 16,
          weight: 70,
          height: 175,
        },
        clinicalNotes: 'Duplicate test',
        icd10PrimaryCode: 'J00',
      };

      await expect(
        service.createMedicalRecord(DOCTOR_USER_ID, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('completes consultation successfully when appointment is IN_CONSULTATION', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: null,
      });

      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        status: AppointmentStatus.IN_CONSULTATION,
      });

      const result = await service.completeConsultation(
        DOCTOR_USER_ID,
        RECORD_ID,
      );

      expect(result.completedAt).not.toBeNull();
      expect(mockAppointmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      );
    });

    it('rejects completing consultation when appointment is in CHECKED_IN status', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: null,
      });

      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        status: AppointmentStatus.CHECKED_IN, // Not yet in consultation
      });

      await expect(
        service.completeConsultation(DOCTOR_USER_ID, RECORD_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects completing consultation when appointment is already COMPLETED', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: null,
      });

      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        status: AppointmentStatus.COMPLETED, // Already completed
      });

      await expect(
        service.completeConsultation(DOCTOR_USER_ID, RECORD_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects completing consultation when linked appointment is not found', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: null,
      });

      mockAppointmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.completeConsultation(DOCTOR_USER_ID, RECORD_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });


  describe('6. 24h EMR Lock (Request-time Lazy Locking Enforcement)', () => {
    it('allows editing EMR within 24 hours after completion', async () => {
      const completionTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Initial notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: completionTime,
      });

      const dto: UpdateMedicalRecordDto = {
        clinicalNotes: 'Updated within 24h grace period.',
      };

      const result = await service.updateMedicalRecord(
        DOCTOR_USER_ID,
        RECORD_ID,
        dto,
      );
      expect(result.clinicalNotes).toBe('Updated within 24h grace period.');
    });

    it('blocks editing and lazily locks EMR when 24 hours have elapsed', async () => {
      const completionTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Initial notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: completionTime,
      });

      const dto: UpdateMedicalRecordDto = {
        clinicalNotes: 'Attempt to update after 24h',
      };

      await expect(
        service.updateMedicalRecord(DOCTOR_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(BadRequestException);

      expect(mockMedicalRecordRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isLocked: true,
          lockedAt: expect.any(Date),
        }),
      );
    });

    it('blocks editing immediately if record is already marked isLocked = true', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Initial notes',
        icd10PrimaryCode: 'J00',
        isLocked: true,
        completedAt: new Date(),
      });

      const dto: UpdateMedicalRecordDto = {
        clinicalNotes: 'Attempt update on locked record',
      };

      await expect(
        service.updateMedicalRecord(DOCTOR_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unauthorized doctor modifying another doctor EMR', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        appointmentId: APPOINTMENT_ID,
        doctorId: OTHER_DOCTOR_ID,
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Initial notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
        completedAt: null,
      });

      const dto: UpdateMedicalRecordDto = {
        clinicalNotes: 'Malicious modification',
      };

      await expect(
        service.updateMedicalRecord(DOCTOR_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('7. Data Isolation & Doctor/Patient Read Authorization', () => {
    it('allows patient to view only their own medical record and denies other patient', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Clinical notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
      });

      // Authorized patient
      const record = await service.getMedicalRecord(
        PATIENT_ID,
        Role.PATIENT,
        RECORD_ID,
      );
      expect(record.id).toBe(RECORD_ID);

      // Unauthorized patient
      await expect(
        service.getMedicalRecord(OTHER_PATIENT_ID, Role.PATIENT, RECORD_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assigned doctor to view EMR and rejects OTHER_DOCTOR', async () => {
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: RECORD_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID, // assigned to DOCTOR_ID
        vitalSigns: { bmi: 22.86 },
        clinicalNotes: 'Clinical notes',
        icd10PrimaryCode: 'J00',
        isLocked: false,
      });

      // Assigned doctor
      const record = await service.getMedicalRecord(
        DOCTOR_USER_ID,
        Role.DOCTOR,
        RECORD_ID,
      );
      expect(record.id).toBe(RECORD_ID);

      // Unauthorized doctor
      await expect(
        service.getMedicalRecord(
          OTHER_DOCTOR_USER_ID,
          Role.DOCTOR,
          RECORD_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Doctor A creates EMR, Doctor B GETs Doctor A EMR => 403 Forbidden (DENY without patient-granted sharing)', async () => {
      // 1. Doctor A creates EMR for Appointment A
      mockAppointmentRepo.findOne.mockResolvedValue({
        id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        status: AppointmentStatus.IN_CONSULTATION,
      });
      mockMedicalRecordRepo.findOne.mockResolvedValue(null);

      const createDto: CreateMedicalRecordDto = {
        appointmentId: APPOINTMENT_ID,
        vitalSigns: {
          bloodPressure: '120/80',
          pulse: 75,
          temperature: 36.8,
          respiratoryRate: 18,
          weight: 65,
          height: 170,
        },
        clinicalNotes: 'Hồ sơ bệnh án do Doctor A tạo.',
        icd10PrimaryCode: 'J00',
      };

      const createdRecord = await service.createMedicalRecord(
        DOCTOR_USER_ID,
        createDto,
      );
      expect(createdRecord.doctorId).toBe(DOCTOR_ID);

      // 2. Doctor B attempts to GET Doctor A's EMR
      mockMedicalRecordRepo.findOne.mockResolvedValue({
        id: createdRecord.id,
        appointmentId: APPOINTMENT_ID,
        doctorId: DOCTOR_ID, // Doctor A
        patientId: PATIENT_ID,
        vitalSigns: { bmi: 22.49 },
        clinicalNotes: 'Hồ sơ bệnh án do Doctor A tạo.',
        icd10PrimaryCode: 'J00',
        isLocked: false,
      });

      // Doctor B request must be denied with 403 Forbidden (no sharing mechanism exists)
      await expect(
        service.getMedicalRecord(
          OTHER_DOCTOR_USER_ID,
          Role.DOCTOR,
          createdRecord.id,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
