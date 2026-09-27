import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClinicalService } from '../src/modules/clinical/clinical.service';
import { Icd10Service } from '../src/modules/clinical/icd10/icd10.service';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import {
  CreatePrescriptionItemDto,
  PrescriptionSafetyCheckDto,
} from '../src/modules/clinical/dto';

describe('Card 3.5: Clinical Drug Safety & Allergy Warning (SRS-DOC-04 & TT 52/2017/TT-BYT)', () => {
  let service: ClinicalService;
  let icd10Service: Icd10Service;

  let mockAppointmentRepo: any;
  let mockDoctorRepo: any;
  let mockPhrRepo: any;
  let mockDataSource: any;
  let mockManager: any;
  let queueEvents: jest.Mocked<Pick<QueueEventsService, 'statusChanged'>>;

  const DOCTOR_USER_ID = 'u-doctor-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_USER_ID = 'u-doctor-2222-2222-2222-222222222222';
  const DOCTOR_ID = 'd-doctor-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_ID = 'd-doctor-2222-2222-2222-222222222222';

  const PATIENT_ALLERGIC_ID = 'u-patient-allergic-1111-1111-111111111111';
  const PATIENT_SAFE_ID = 'u-patient-safe-2222-2222-222222222222';
  const PATIENT_CHRONIC_ID = 'u-patient-chronic-3333-3333-333333333333';
  const PATIENT_ACUTE_ID = 'u-patient-acute-4444-4444-444444444444';

  const APPOINTMENT_ID = 'a-appoint-1111-1111-1111-111111111111';

  beforeEach(() => {
    icd10Service = new Icd10Service();

    mockAppointmentRepo = {
      findOne: jest.fn(async ({ where }) => {
        if (where.id === APPOINTMENT_ID) {
          return {
            id: APPOINTMENT_ID,
            doctorId: DOCTOR_ID,
            patientId: PATIENT_ALLERGIC_ID,
          };
        }
        return null;
      }),
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
        if (where.userId === PATIENT_ALLERGIC_ID) {
          return {
            userId: PATIENT_ALLERGIC_ID,
            allergies: 'Penicillin, Aspirin, Sulfonamide',
            chronicDiseases: 'Hen phế quản, Đái tháo đường type 2',
          };
        }
        if (where.userId === PATIENT_SAFE_ID) {
          return {
            userId: PATIENT_SAFE_ID,
            allergies: '',
            chronicDiseases: '',
          };
        }
        if (where.userId === PATIENT_CHRONIC_ID) {
          return {
            userId: PATIENT_CHRONIC_ID,
            allergies: 'Paracetamol',
            chronicDiseases: 'Tăng huyết áp vô căn (I10)',
          };
        }
        if (where.userId === PATIENT_ACUTE_ID) {
          return {
            userId: PATIENT_ACUTE_ID,
            allergies: '',
            chronicDiseases: '',
          };
        }
        return null;
      }),
    };

    mockManager = {
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name || '';
        if (name.includes('Appointment')) return mockAppointmentRepo;
        if (name.includes('Doctor')) return mockDoctorRepo;
        if (name.includes('PersonalHealthProfile')) return mockPhrRepo;
        return {};
      }),
    };

    mockDataSource = {
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name || '';
        if (name.includes('Appointment')) return mockAppointmentRepo;
        if (name.includes('Doctor')) return mockDoctorRepo;
        if (name.includes('PersonalHealthProfile')) return mockPhrRepo;
        return {};
      }),
      transaction: jest.fn(async (work: (mgr: EntityManager) => Promise<any>) =>
        work(mockManager),
      ),
    } as unknown as DataSource;

    queueEvents = {
      statusChanged: jest.fn().mockResolvedValue(undefined),
    };

    service = new ClinicalService(
      mockDataSource,
      icd10Service,
      queueEvents as unknown as QueueEventsService,
    );
  });

  describe('1. Drug Allergy Matching (SRS-DOC-04 Section 4.3.4)', () => {
    it('TC-SAFE-01: detects direct allergy matching on trade name or allergy group (Penicillin)', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amoxicillin 500mg (Penicillin group)',
          activeIngredient: 'Amoxicillin Trihydrate',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '1',
          usageInstructions: 'Uống sau ăn',
          totalQuantity: 14,
          durationDays: 7,
        },
      ];

      const result = await service.checkPrescriptionSafety(
        PATIENT_ALLERGIC_ID,
        items,
      );

      expect(result.hasWarning).toBe(true);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0].matchedAllergy).toBe('penicillin');
      expect(result.warnings[0].warningMessage).toContain('CẢNH BÁO: Bệnh nhân có tiền sử dị ứng với "penicillin"');
    });

    it('TC-SAFE-02: detects cross-allergy matching on active ingredient (Acetylsalicylic acid -> Aspirin)', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Cardiopirin 81mg',
          activeIngredient: 'Aspirin (Acetylsalicylic acid)',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '0',
          usageInstructions: 'Uống sau ăn',
          totalQuantity: 30,
          durationDays: 30,
        },
      ];

      const result = await service.checkPrescriptionSafety(
        PATIENT_ALLERGIC_ID,
        items,
      );

      expect(result.hasWarning).toBe(true);
      expect(result.warnings[0].warningMessage).toContain('aspirin');
      expect(result.warnings[0].warningMessage).toContain('Cardiopirin 81mg');
    });

    it('TC-SAFE-03: handles multiple drugs with mixed allergic and safe items', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Bactrim 480mg',
          activeIngredient: 'Sulfamethoxazole + Trimethoprim (Sulfonamide)',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '1',
          usageInstructions: 'Uống sau ăn',
          totalQuantity: 10,
          durationDays: 5,
        },
        {
          medicineName: 'Paracetamol 500mg',
          activeIngredient: 'Paracetamol',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '1',
          usageInstructions: 'Uống khi sốt/đau',
          totalQuantity: 10,
          durationDays: 5,
        },
      ];

      const result = await service.checkPrescriptionSafety(
        PATIENT_ALLERGIC_ID,
        items,
      );

      expect(result.hasWarning).toBe(true);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0].medicineName).toBe('Bactrim 480mg');
      expect(result.warnings[0].matchedAllergy).toBe('sulfonamide');
    });

    it('TC-SAFE-04: passes completely when patient has no matching allergies or empty PHR allergies', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Paracetamol 500mg',
          activeIngredient: 'Paracetamol',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '1',
          usageInstructions: 'Uống sau ăn',
          totalQuantity: 10,
          durationDays: 5,
        },
      ];

      const resultSafe = await service.checkPrescriptionSafety(
        PATIENT_SAFE_ID,
        items,
      );
      expect(resultSafe.hasWarning).toBe(false);
      expect(resultSafe.warnings.length).toBe(0);

      // Even for allergic patient, if drug is not in allergy list, it passes
      const resultAllergic = await service.checkPrescriptionSafety(
        PATIENT_ALLERGIC_ID,
        items,
      );
      expect(resultAllergic.hasWarning).toBe(false);
      expect(resultAllergic.warnings.length).toBe(0);
    });
  });

  describe('2. Chronic Disease 30-Day Prescription Limit (Circular 52/2017/TT-BYT)', () => {
    it('TC-SAFE-05: allows prescription <= 30 days for chronic patient', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine besylate',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '0',
          usageInstructions: 'Sáng sau ăn',
          totalQuantity: 30, // 30 pills / 1 per day = 30 days
          durationDays: 30,
        },
      ];

      const result = await service.checkPrescriptionSafety(
        PATIENT_CHRONIC_ID,
        items,
        'I10', // ICD-10 Hypertension
      );

      expect(result.hasWarning).toBe(false);
    });

    it('TC-SAFE-06: rejects prescription > 30 days for chronic patient with explicit durationDays', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Amlodipine 5mg',
          activeIngredient: 'Amlodipine besylate',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '0',
          usageInstructions: 'Sáng sau ăn',
          totalQuantity: 45,
          durationDays: 45, // > 30 days
        },
      ];

      await expect(
        service.checkPrescriptionSafety(
          PATIENT_CHRONIC_ID,
          items,
          'I10',
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.checkPrescriptionSafety(
          PATIENT_CHRONIC_ID,
          items,
          'I10',
        );
      } catch (err: any) {
        expect(err.response.code).toBe('CHRONIC_PRESCRIPTION_EXCEEDED_30_DAYS');
        expect(err.response.message).toContain('Thông tư 52/2017/TT-BYT');
        expect(err.response.message).toContain('45 ngày');
      }
    });

    it('TC-SAFE-07: rejects prescription > 30 days calculated from daily dosage (totalQuantity / dailyDosage)', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Metformin 850mg',
          activeIngredient: 'Metformin hydrochloride',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '1', // 2 pills / day
          usageInstructions: 'Sau ăn',
          totalQuantity: 70, // 70 / 2 = 35 days (> 30 days)
        },
      ];

      await expect(
        service.checkPrescriptionSafety(
          PATIENT_ALLERGIC_ID, // Has chronic disease: Hen phế quản, Đái tháo đường
          items,
          'E11.9',
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.checkPrescriptionSafety(
          PATIENT_ALLERGIC_ID,
          items,
          'E11.9',
        );
      } catch (err: any) {
        expect(err.response.code).toBe('CHRONIC_PRESCRIPTION_EXCEEDED_30_DAYS');
        expect(err.response.message).toContain('35 ngày');
      }
    });

    it('TC-SAFE-08: allows acute condition without chronic diagnosis to exceed 30 days if clinically needed', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Vitamin C 500mg',
          activeIngredient: 'Ascorbic acid',
          unit: 'Viên',
          dosageMorning: '1',
          dosageNoon: '0',
          dosageAfternoon: '0',
          dosageNight: '0',
          usageInstructions: 'Sáng sau ăn',
          totalQuantity: 60,
          durationDays: 60,
        },
      ];

      // Patient has NO chronic diseases in PHR and acute ICD-10 (J00 - Common cold)
      const result = await service.checkPrescriptionSafety(
        PATIENT_ACUTE_ID,
        items,
        'J00',
      );

      expect(result.hasWarning).toBe(false);
    });

    it('TC-SAFE-09: rejects chronic patient when duration and dosage cannot be computed', async () => {
      const items: CreatePrescriptionItemDto[] = [
        {
          medicineName: 'Salbutamol Inhaler',
          activeIngredient: 'Salbutamol',
          unit: 'Bình xịt',
          dosageMorning: 'Khi cần',
          dosageNoon: '',
          dosageAfternoon: '',
          dosageNight: '',
          usageInstructions: 'Khi lên cơn khó thở',
          totalQuantity: 1, // Cannot divide by 'Khi cần' and no durationDays
        },
      ];

      await expect(
        service.checkPrescriptionSafety(
          PATIENT_ALLERGIC_ID,
          items,
          'J45.9', // Asthma (chronic)
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.checkPrescriptionSafety(
          PATIENT_ALLERGIC_ID,
          items,
          'J45.9',
        );
      } catch (err: any) {
        expect(err.response.code).toBe('CHRONIC_PRESCRIPTION_DURATION_UNDETERMINED');
      }
    });
  });

  describe('3. Doctor Authorization & Endpoint Validation (checkPrescriptionSafetyEndpoint)', () => {
    it('TC-SAFE-10: rejects call if appointment is not found (404 NotFoundException)', async () => {
      const dto: PrescriptionSafetyCheckDto = {
        appointmentId: 'non-existent-appointment',
        items: [],
      };

      await expect(
        service.checkPrescriptionSafetyEndpoint(DOCTOR_USER_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('TC-SAFE-11: rejects call if doctor is not assigned to the appointment (403 ForbiddenException)', async () => {
      const dto: PrescriptionSafetyCheckDto = {
        appointmentId: APPOINTMENT_ID,
        items: [],
      };

      await expect(
        service.checkPrescriptionSafetyEndpoint(OTHER_DOCTOR_USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.checkPrescriptionSafetyEndpoint(OTHER_DOCTOR_USER_ID, dto);
      } catch (err: any) {
        expect(err.response.code).toBe('UNAUTHORIZED_DOCTOR');
      }
    });

    it('TC-SAFE-12: allows assigned doctor to run safety check endpoint successfully', async () => {
      const dto: PrescriptionSafetyCheckDto = {
        appointmentId: APPOINTMENT_ID,
        icd10PrimaryCode: 'J00',
        items: [
          {
            medicineName: 'Amoxicillin 500mg',
            activeIngredient: 'Amoxicillin',
            unit: 'Viên',
            dosageMorning: '1',
            dosageNoon: '0',
            dosageAfternoon: '0',
            dosageNight: '1',
            usageInstructions: 'Sau ăn',
            totalQuantity: 14,
            durationDays: 7,
          },
        ],
      };

      const result = await service.checkPrescriptionSafetyEndpoint(
        DOCTOR_USER_ID,
        dto,
      );

      expect(result.hasWarning).toBe(true);
      expect(result.warnings[0].matchedAllergy).toBe('penicillin');
    });
  });
});
