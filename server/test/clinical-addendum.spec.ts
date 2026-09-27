import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Role } from '@shared/enums';
import { Reflector } from '@nestjs/core';

import { ClinicalService } from '../src/modules/clinical/clinical.service';
import { ClinicalController } from '../src/modules/clinical/clinical.controller';
import { Icd10Service } from '../src/modules/clinical/icd10/icd10.service';
import { CreateEmrAddendumDto } from '../src/modules/clinical/dto';
import { REQUIRED_ROLES } from '../src/common/decorators/auth.decorators';

describe('Card 3.10: EMR Addendum (Section 5.4 & SRS-DOC-03)', () => {
  let service: ClinicalService;
  let controller: ClinicalController;
  let icd10Service: Icd10Service;
  const reflector = new Reflector();

  // Mock repos
  let mockMedicalRecordRepo: any;
  let mockEmrAddendumRepo: any;
  let mockDoctorRepo: any;
  let mockAppointmentRepo: any;
  let mockPrescriptionRepo: any;
  let mockPhrRepo: any;
  let mockDataSource: any;

  const DOCTOR_USER_ID = 'u-doctor-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_USER_ID = 'u-doctor-2222-2222-2222-222222222222';
  const PATIENT_USER_ID = 'u-patient-1111-1111-1111-111111111111';
  const OTHER_PATIENT_USER_ID = 'u-patient-2222-2222-2222-222222222222';
  const ADMIN_USER_ID = 'u-admin-1111-1111-1111-111111111111';

  const DOCTOR_ID = 'd-doctor-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_ID = 'd-doctor-2222-2222-2222-222222222222';
  const APPOINTMENT_ID = 'a-appoint-1111-1111-1111-111111111111';
  const RECORD_ID = 'm-record-1111-1111-1111-111111111111';

  let addendumDatabase: any[] = [];
  let recordDatabase: any = null;

  beforeEach(() => {
    icd10Service = new Icd10Service();
    addendumDatabase = [];

    // Default locked record (completed 25 hours ago)
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    recordDatabase = {
      id: RECORD_ID,
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_USER_ID,
      doctorId: DOCTOR_ID,
      vitalSigns: {
        bloodPressure: '120/80',
        pulse: 75,
        temperature: 36.8,
        respiratoryRate: 18,
        weight: 65,
        height: 170,
        bmi: 22.49,
      },
      clinicalNotes: 'Ghi chú ban đầu: Bệnh nhân đau đầu nhẹ.',
      icd10PrimaryCode: 'R51',
      icd10SecondaryCodes: 'I10',
      doctorAdvice: 'Nghỉ ngơi và uống nhiều nước.',
      followUpDate: '2026-10-01',
      isLocked: true,
      lockedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      completedAt: twentyFiveHoursAgo,
    };

    mockMedicalRecordRepo = {
      findOne: jest.fn(async ({ where }) => {
        if (where.id === RECORD_ID) return { ...recordDatabase };
        return null;
      }),
      save: jest.fn(async (data) => {
        recordDatabase = { ...recordDatabase, ...data };
        return recordDatabase;
      }),
    };

    mockEmrAddendumRepo = {
      find: jest.fn(async ({ where }) => {
        return addendumDatabase.filter(
          (a) => a.medicalRecordId === where.medicalRecordId,
        );
      }),
      create: jest.fn((data) => ({
        id: `addendum-${addendumDatabase.length + 1}`,
        createdAt: new Date(),
        ...data,
      })),
      save: jest.fn(async (data) => {
        const item = {
          ...data,
          id: data.id || `addendum-${addendumDatabase.length + 1}`,
          createdAt: data.createdAt || new Date(),
        };
        addendumDatabase.push(item);
        return item;
      }),
    };

    mockDoctorRepo = {
      findOne: jest.fn(async ({ where }) => {
        if (where.userId === DOCTOR_USER_ID) {
          return {
            id: DOCTOR_ID,
            userId: DOCTOR_USER_ID,
            licenseNumber: 'CCHN-001234',
            user: { fullName: 'Bác sĩ Nguyễn Văn A' },
          };
        }
        if (where.userId === OTHER_DOCTOR_USER_ID) {
          return {
            id: OTHER_DOCTOR_ID,
            userId: OTHER_DOCTOR_USER_ID,
            licenseNumber: 'CCHN-009999',
            user: { fullName: 'Bác sĩ Lê Thị B' },
          };
        }
        return null;
      }),
    };

    mockAppointmentRepo = { findOne: jest.fn() };
    mockPrescriptionRepo = { findOne: jest.fn() };
    mockPhrRepo = { findOne: jest.fn() };

    mockDataSource = {
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name || '';
        if (name.includes('MedicalRecord')) return mockMedicalRecordRepo;
        if (name.includes('EmrAddendum')) return mockEmrAddendumRepo;
        if (name.includes('Doctor')) return mockDoctorRepo;
        if (name.includes('Appointment')) return mockAppointmentRepo;
        if (name.includes('Prescription')) return mockPrescriptionRepo;
        if (name.includes('PersonalHealthProfile')) return mockPhrRepo;
        return { findOne: jest.fn(), save: jest.fn() };
      }),
    };

    service = new ClinicalService(mockDataSource as any, icd10Service);
    controller = new ClinicalController(service, icd10Service);
  });

  describe('1. 24h Lock Enforcement on Addendum Creation', () => {
    it('rejects Addendum creation before 24h lock with EMR_NOT_LOCKED', async () => {
      // EMR completed only 2 hours ago (within 24 hours, not locked)
      recordDatabase.completedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      recordDatabase.isLocked = false;
      recordDatabase.lockedAt = null;

      const dto: CreateEmrAddendumDto = {
        reason: 'Bổ sung kết quả xét nghiệm máu.',
        clinicalNotes: 'Bệnh nhân có thêm triệu chứng chóng mặt.',
      };

      await expect(
        service.createEmrAddendum(DOCTOR_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.createEmrAddendum(DOCTOR_USER_ID, RECORD_ID, dto);
      } catch (err: any) {
        expect(err.response.code).toBe('EMR_NOT_LOCKED');
      }
    });

    it('rejects Addendum creation if EMR is still in DRAFT (completedAt is null)', async () => {
      recordDatabase.completedAt = null;
      recordDatabase.isLocked = false;

      const dto: CreateEmrAddendumDto = {
        reason: 'Thử tạo phụ lục khi chưa hoàn tất.',
      };

      await expect(
        service.createEmrAddendum(DOCTOR_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows responsible doctor to create Addendum after 24h lock', async () => {
      const dto: CreateEmrAddendumDto = {
        reason: 'Bổ sung kết quả chụp X-quang phổi.',
        clinicalNotes: 'Phổi sáng, không thâm nhiễm mới.',
      };

      const result = await service.createEmrAddendum(
        DOCTOR_USER_ID,
        RECORD_ID,
        dto,
      );

      expect(result).toBeDefined();
      expect(result.medicalRecordId).toBe(RECORD_ID);
      expect(result.doctorId).toBe(DOCTOR_ID);
      expect(result.reason).toBe('Bổ sung kết quả chụp X-quang phổi.');
      expect(result.doctorName).toBe('Bác sĩ Nguyễn Văn A');
      expect(result.doctorLicenseNumber).toBe('CCHN-001234');
    });
  });

  describe('2. Doctor, Patient, and Admin Role Authorization on Addendum Creation', () => {
    it('rejects Addendum creation by another doctor (not responsible for this record)', async () => {
      const dto: CreateEmrAddendumDto = {
        reason: 'Bác sĩ khác cố ý can thiệp.',
      };

      await expect(
        service.createEmrAddendum(OTHER_DOCTOR_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.createEmrAddendum(OTHER_DOCTOR_USER_ID, RECORD_ID, dto);
      } catch (err: any) {
        expect(err.response.code).toBe('UNAUTHORIZED_DOCTOR');
      }
    });

    it('rejects Addendum creation by a patient user', async () => {
      const dto: CreateEmrAddendumDto = {
        reason: 'Bệnh nhân tự tạo phụ lục.',
      };

      await expect(
        service.createEmrAddendum(PATIENT_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects Addendum creation by admin user (admin has no doctor profile)', async () => {
      const dto: CreateEmrAddendumDto = {
        reason: 'Admin tự tạo phụ lục.',
      };

      await expect(
        service.createEmrAddendum(ADMIN_USER_ID, RECORD_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates controller route @Roles decorator allows only Role.DOCTOR for createAddendum', () => {
      const roles = reflector.get<Role[]>(
        REQUIRED_ROLES,
        controller.createEmrAddendum,
      );
      expect(roles).toEqual([Role.DOCTOR]);
    });
  });

  describe('3. Immutability of Original medical_records Row', () => {
    it('does NOT modify or mutate original medical_records row when Addendum is created', async () => {
      const initialClinicalNotes = recordDatabase.clinicalNotes;
      const initialAdvice = recordDatabase.doctorAdvice;
      const initialVitals = { ...recordDatabase.vitalSigns };

      mockMedicalRecordRepo.save.mockClear();

      const dto: CreateEmrAddendumDto = {
        reason: 'Thay đổi lời dặn dò và ghi chú lâm sàng.',
        clinicalNotes: 'Ghi chú mới hoàn toàn khác bản gốc.',
        doctorAdvice: 'Uống thuốc đều đặn và tái khám sớm.',
      };

      await service.createEmrAddendum(DOCTOR_USER_ID, RECORD_ID, dto);

      // Verify medicalRecordRepo.save was NOT called to update the record content
      expect(recordDatabase.clinicalNotes).toBe(initialClinicalNotes);
      expect(recordDatabase.doctorAdvice).toBe(initialAdvice);
      expect(recordDatabase.vitalSigns).toEqual(initialVitals);
    });
  });

  describe('4. Full Snapshot Semantics and Chaining', () => {
    it('captures full previous_content and full updated_content snapshots in Addendum 1', async () => {
      const dto: CreateEmrAddendumDto = {
        reason: 'Cập nhật lời dặn và mã ICD phụ.',
        doctorAdvice: 'Nghỉ ngơi 3 ngày, hạn chế vận động mạnh.',
        icd10SecondaryCodes: 'I10, E11.9',
      };

      const addendum1 = await service.createEmrAddendum(
        DOCTOR_USER_ID,
        RECORD_ID,
        dto,
      );

      // previous_content is full original snapshot
      expect(addendum1.previousContent).toBeDefined();
      expect(addendum1.previousContent.clinicalNotes).toBe(
        recordDatabase.clinicalNotes,
      );
      expect(addendum1.previousContent.icd10PrimaryCode).toBe('R51');
      expect(addendum1.previousContent.icd10SecondaryCodes).toBe('I10');
      expect(addendum1.previousContent.doctorAdvice).toBe(
        'Nghỉ ngơi và uống nhiều nước.',
      );
      expect(addendum1.previousContent.vitalSigns?.pulse).toBe(75);

      // updated_content is full resulting snapshot with merged fields
      expect(addendum1.updatedContent).toBeDefined();
      expect(addendum1.updatedContent.clinicalNotes).toBe(
        recordDatabase.clinicalNotes,
      ); // unchanged field preserved
      expect(addendum1.updatedContent.icd10PrimaryCode).toBe('R51'); // preserved
      expect(addendum1.updatedContent.icd10SecondaryCodes).toBe('I10, E11.9'); // updated
      expect(addendum1.updatedContent.doctorAdvice).toBe(
        'Nghỉ ngơi 3 ngày, hạn chế vận động mạnh.',
      ); // updated
      expect(addendum1.updatedContent.vitalSigns?.pulse).toBe(75); // preserved
    });

    it('correctly chains full snapshots across Addendum 1, Addendum 2, and Addendum 3', async () => {
      // Addendum 1: update clinicalNotes
      const addendum1 = await service.createEmrAddendum(
        DOCTOR_USER_ID,
        RECORD_ID,
        {
          reason: 'Lần 1: Bổ sung ghi chú.',
          clinicalNotes: 'Ghi chú sau Addendum 1.',
        },
      );
      expect(addendum1.previousContent.clinicalNotes).toBe(
        'Ghi chú ban đầu: Bệnh nhân đau đầu nhẹ.',
      );
      expect(addendum1.updatedContent.clinicalNotes).toBe(
        'Ghi chú sau Addendum 1.',
      );

      // Addendum 2: update doctorAdvice
      const addendum2 = await service.createEmrAddendum(
        DOCTOR_USER_ID,
        RECORD_ID,
        {
          reason: 'Lần 2: Sửa lời dặn.',
          doctorAdvice: 'Lời dặn sau Addendum 2.',
        },
      );
      // previousContent of Addendum 2 must match updatedContent of Addendum 1!
      expect(addendum2.previousContent.clinicalNotes).toBe(
        'Ghi chú sau Addendum 1.',
      );
      expect(addendum2.updatedContent.clinicalNotes).toBe(
        'Ghi chú sau Addendum 1.',
      );
      expect(addendum2.updatedContent.doctorAdvice).toBe(
        'Lời dặn sau Addendum 2.',
      );

      // Addendum 3: update followUpDate
      const addendum3 = await service.createEmrAddendum(
        DOCTOR_USER_ID,
        RECORD_ID,
        {
          reason: 'Lần 3: Đổi lịch tái khám.',
          followUpDate: '2026-10-15',
        },
      );
      expect(addendum3.previousContent.doctorAdvice).toBe(
        'Lời dặn sau Addendum 2.',
      );
      expect(addendum3.previousContent.clinicalNotes).toBe(
        'Ghi chú sau Addendum 1.',
      );
      expect(addendum3.updatedContent.followUpDate).toBe('2026-10-15');
      expect(addendum3.updatedContent.doctorAdvice).toBe(
        'Lời dặn sau Addendum 2.',
      );
      expect(addendum3.updatedContent.clinicalNotes).toBe(
        'Ghi chú sau Addendum 1.',
      );
    });
  });

  describe('5. EMR History API & Authorization (Doctor, Patient, Admin)', () => {
    beforeEach(async () => {
      // Create 2 addendums for history testing
      await service.createEmrAddendum(DOCTOR_USER_ID, RECORD_ID, {
        reason: 'Phụ lục 1: Cập nhật ghi chú.',
        clinicalNotes: 'Ghi chú sau phụ lục 1.',
      });
      await service.createEmrAddendum(DOCTOR_USER_ID, RECORD_ID, {
        reason: 'Phụ lục 2: Cập nhật lời dặn.',
        doctorAdvice: 'Uống thuốc đúng giờ.',
      });
    });

    it('allows responsible doctor to retrieve EMR history with original record + all addendums', async () => {
      const history = await service.getEmrHistory(
        DOCTOR_USER_ID,
        Role.DOCTOR,
        RECORD_ID,
      );

      expect(history).toBeDefined();
      expect(history.recordId).toBe(RECORD_ID);
      expect(history.isLocked).toBe(true);
      expect(history.originalSnapshot.clinicalNotes).toBe(
        'Ghi chú ban đầu: Bệnh nhân đau đầu nhẹ.',
      );
      expect(history.currentSnapshot.clinicalNotes).toBe(
        'Ghi chú sau phụ lục 1.',
      );
      expect(history.currentSnapshot.doctorAdvice).toBe('Uống thuốc đúng giờ.');
      expect(history.addendums.length).toBe(2);
      expect(history.addendums[0].reason).toBe(
        'Phụ lục 1: Cập nhật ghi chú.',
      );
      expect(history.addendums[1].reason).toBe(
        'Phụ lục 2: Cập nhật lời dặn.',
      );
    });

    it('allows owning patient to retrieve EMR history', async () => {
      const history = await service.getEmrHistory(
        PATIENT_USER_ID,
        Role.PATIENT,
        RECORD_ID,
      );

      expect(history).toBeDefined();
      expect(history.recordId).toBe(RECORD_ID);
      expect(history.addendums.length).toBe(2);
    });

    it('DENIES other doctor from viewing EMR history (403 Forbidden)', async () => {
      await expect(
        service.getEmrHistory(OTHER_DOCTOR_USER_ID, Role.DOCTOR, RECORD_ID),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.getEmrHistory(
          OTHER_DOCTOR_USER_ID,
          Role.DOCTOR,
          RECORD_ID,
        );
      } catch (err: any) {
        expect(err.response.code).toBe('FORBIDDEN_ACCESS');
      }
    });

    it('DENIES other patient from viewing EMR history (403 Forbidden)', async () => {
      await expect(
        service.getEmrHistory(OTHER_PATIENT_USER_ID, Role.PATIENT, RECORD_ID),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.getEmrHistory(
          OTHER_PATIENT_USER_ID,
          Role.PATIENT,
          RECORD_ID,
        );
      } catch (err: any) {
        expect(err.response.code).toBe('FORBIDDEN_ACCESS');
      }
    });

    it('DENIES ADMIN from viewing EMR history (403 Forbidden)', async () => {
      await expect(
        service.getEmrHistory(ADMIN_USER_ID, Role.ADMIN, RECORD_ID),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.getEmrHistory(ADMIN_USER_ID, Role.ADMIN, RECORD_ID);
      } catch (err: any) {
        expect(err.response.code).toBe('FORBIDDEN_ACCESS');
      }
    });

    it('validates controller route @Roles decorator allows ONLY DOCTOR and PATIENT for history', () => {
      const roles = reflector.get<Role[]>(
        REQUIRED_ROLES,
        controller.getEmrHistory,
      );
      expect(roles).toEqual([Role.DOCTOR, Role.PATIENT]);
      expect(roles).not.toContain(Role.ADMIN);
    });

    it('returns NotFoundException when medical record does not exist', async () => {
      await expect(
        service.getEmrHistory(
          DOCTOR_USER_ID,
          Role.DOCTOR,
          'm-non-existent-uuid',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('6. DTO Validation for CreateEmrAddendumDto', () => {
    it('passes validation when valid reason and optional fields are provided', async () => {
      const dto = plainToInstance(CreateEmrAddendumDto, {
        reason: 'Bổ sung kết quả cận lâm sàng theo yêu cầu chuyên môn.',
        clinicalNotes: 'Ghi chú lâm sàng hợp lệ.',
        doctorAdvice: 'Uống thuốc đúng liều lượng.',
        followUpDate: '2026-10-10',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects when reason is missing or empty', async () => {
      const dto = plainToInstance(CreateEmrAddendumDto, {
        reason: '',
        clinicalNotes: 'Thiếu lý do.',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const reasonErr = errors.find((e) => e.property === 'reason');
      expect(reasonErr).toBeDefined();
    });

    it('rejects when reason exceeds 1000 characters', async () => {
      const longReason = 'A'.repeat(1001);
      const dto = plainToInstance(CreateEmrAddendumDto, {
        reason: longReason,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const reasonErr = errors.find((e) => e.property === 'reason');
      expect(reasonErr).toBeDefined();
    });

    it('rejects when followUpDate is an invalid date string', async () => {
      const dto = plainToInstance(CreateEmrAddendumDto, {
        reason: 'Lý do hợp lệ',
        followUpDate: 'invalid-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const dateErr = errors.find((e) => e.property === 'followUpDate');
      expect(dateErr).toBeDefined();
    });
  });
});
