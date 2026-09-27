import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppointmentStatus, PaymentStatus, Role, SlotStatus } from '@shared/enums';
import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_DOCTOR_ROOM,
  QUEUE_PUBLIC_ROOM,
  QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
} from '../../shared/src/constants/queue-socket.constants';

import { ClinicalService } from '../src/modules/clinical/clinical.service';
import { Icd10Service } from '../src/modules/clinical/icd10/icd10.service';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { QueueGateway } from '../src/modules/realtime/queue.gateway';
import { QueueQueryService } from '../src/modules/realtime/queue-query.service';
import { AppointmentLifecycleService } from '../src/modules/appointment/appointment-lifecycle.service';
import { NotificationProducerService } from '../src/modules/notification/producers/notification-producer.service';
import {
  CreateMedicalRecordDto,
  CreatePrescriptionItemDto,
  PrescriptionSafetyCheckDto,
} from '../src/modules/clinical/dto';

describe('Card 3.5: Clinical Workflow End-to-End Integration Suite (SRS-DOC-02..04, SRS-REC-01, Section 3.4 & 5.4)', () => {
  let clinicalService: ClinicalService;
  let lifecycleService: AppointmentLifecycleService;
  let queueEventsService: QueueEventsService;
  let queueGateway: jest.Mocked<Pick<QueueGateway, 'emitToRoom'>>;
  let queueQueries: jest.Mocked<Pick<QueueQueryService, 'ticket'>>;
  let notificationProducer: jest.Mocked<Pick<NotificationProducerService, 'enqueueAppointmentCancellationEmail' | 'enqueueAppointmentCancellationSms'>>;

  const DOCTOR_USER_ID = 'u-doctor-1111-1111-1111-111111111111';
  const DOCTOR_ID = 'd-doctor-1111-1111-1111-111111111111';
  const PATIENT_USER_ID = 'u-patient-1111-1111-1111-111111111111';
  const APPOINTMENT_ID = 'a-appoint-1111-1111-1111-111111111111';
  const SCHEDULE_ID = 's-schedule-1111-1111-1111-111111111111';

  // In-memory data store for the test lifecycle
  let dbAppointment: any;
  let dbSchedule: any;
  let dbPhr: any;
  let dbDoctor: any;
  let dbMedicalRecord: any;
  let dbAddendums: any[];

  let mockDataSource: any;
  let mockManager: any;

  beforeEach(() => {
    dbAppointment = {
      id: APPOINTMENT_ID,
      appointmentCode: 'APT-260928-0001',
      patientId: PATIENT_USER_ID,
      doctorId: DOCTOR_ID,
      scheduleId: SCHEDULE_ID,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      queueNumber: null,
      checkedInAt: null,
      createdAt: new Date('2026-09-28T07:00:00Z'),
    };

    dbSchedule = {
      id: SCHEDULE_ID,
      doctorId: DOCTOR_ID,
      date: '2026-09-28',
      startTime: '08:00',
      endTime: '08:30',
      status: SlotStatus.BOOKED,
    };

    dbPhr = {
      userId: PATIENT_USER_ID,
      allergies: 'Penicillin, Aspirin',
      chronicDiseases: 'Hen phế quản (Asthma J45.9)',
    };

    dbDoctor = {
      id: DOCTOR_ID,
      userId: DOCTOR_USER_ID,
      roomNumber: 'P.201',
      licenseNumber: 'CCHN-0012345/HN',
      user: { fullName: 'BS. Lê Cường' },
    };

    dbMedicalRecord = null;
    dbAddendums = [];

    queueGateway = {
      emitToRoom: jest.fn(),
    };

    queueQueries = {
      ticket: jest.fn(async (appId: string) => ({
        appointmentId: appId,
        appointmentCode: dbAppointment.appointmentCode,
        doctorId: dbAppointment.doctorId,
        doctorName: dbDoctor.user.fullName,
        roomNumber: dbDoctor.roomNumber,
        patientName: 'Bệnh nhân Test',
        specialtyName: 'Hô hấp',
        queueNumber: dbAppointment.queueNumber || 1,
        status: dbAppointment.status,
        queueSource: 'APPOINTMENT' as any,
        queueDate: '2026-09-28',
        checkedInAt: dbAppointment.checkedInAt?.toISOString() || null,
      })),
    };

    queueEventsService = new QueueEventsService(
      queueQueries as unknown as QueueQueryService,
      queueGateway as unknown as QueueGateway,
    );

    mockManager = {
      save: jest.fn(async (arg1: any, arg2?: any) => {
        const entity = arg2 !== undefined ? arg2 : arg1;
        if (entity === dbAppointment || entity?.id === APPOINTMENT_ID) {
          Object.assign(dbAppointment, entity);
          return dbAppointment;
        }
        return entity;
      }),
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name || '';
        if (name.includes('Appointment')) {
          return {
            findOne: jest.fn(async ({ where }) => (where.id === APPOINTMENT_ID ? dbAppointment : null)),
            findOneBy: jest.fn(async (crit) => (crit.id === APPOINTMENT_ID ? dbAppointment : null)),
            createQueryBuilder: jest.fn(() => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn(async () => dbAppointment),
            })),
            save: jest.fn(async (app) => Object.assign(dbAppointment, app)),
          };
        }
        if (name.includes('DoctorSchedule')) {
          return {
            findOneByOrFail: jest.fn(async () => dbSchedule),
            save: jest.fn(async (s) => Object.assign(dbSchedule, s)),
          };
        }
        if (name.includes('Doctor')) {
          return {
            existsBy: jest.fn(async ({ id, userId }) => id === DOCTOR_ID && userId === DOCTOR_USER_ID),
            findOne: jest.fn(async () => dbDoctor),
          };
        }
        if (name.includes('PersonalHealthProfile')) {
          return {
            findOne: jest.fn(async () => dbPhr),
          };
        }
        if (name.includes('MedicalRecord')) {
          return {
            findOne: jest.fn(async ({ where }) => {
              if (where.appointmentId === APPOINTMENT_ID || where.id === dbMedicalRecord?.id) {
                return dbMedicalRecord;
              }
              return null;
            }),
            create: jest.fn((dto) => ({ id: 'rec-123', ...dto })),
            save: jest.fn(async (rec) => {
              dbMedicalRecord = Object.assign(dbMedicalRecord || { id: 'rec-123' }, rec);
              return dbMedicalRecord;
            }),
          };
        }
        if (name.includes('PrescriptionItem')) {
          return {
            create: jest.fn((dto) => ({ id: 'pi-1', ...dto })),
            save: jest.fn(async (items) => (Array.isArray(items) ? items : [items])),
          };
        }
        if (name.includes('Prescription')) {
          return {
            create: jest.fn((dto) => ({ id: 'rx-1', ...dto })),
            save: jest.fn(async (rx) => rx),
          };
        }
        if (name.includes('EmrAddendum')) {
          return {
            create: jest.fn((dto) => ({ id: `add-${dbAddendums.length + 1}`, ...dto, createdAt: new Date() })),
            save: jest.fn(async (add) => {
              dbAddendums.push(add);
              return add;
            }),
            find: jest.fn(async () => dbAddendums),
          };
        }
        return {};
      }),
    };

    mockDataSource = {
      getRepository: (entity: any) => mockManager.getRepository(entity),
      transaction: jest.fn(async (arg1: any, arg2?: any) => {
        const work = typeof arg1 === 'function' ? arg1 : arg2;
        return work(mockManager);
      }),
    } as unknown as DataSource;

    notificationProducer = {
      enqueueAppointmentCancellationEmail: jest.fn().mockResolvedValue(undefined),
      enqueueAppointmentCancellationSms: jest.fn().mockResolvedValue(undefined),
    };

    lifecycleService = new AppointmentLifecycleService(
      mockDataSource,
      notificationProducer as unknown as NotificationProducerService,
      queueEventsService,
    );

    clinicalService = new ClinicalService(
      mockDataSource,
      new Icd10Service(),
      queueEventsService,
    );
  });

  it('TC-E2E-FULL-WORKFLOW: Executes complete clinical consultation lifecycle with safety checks & 24h lock', async () => {
    // =========================================================================
    // STEP 1: INITIAL STATE (CONFIRMED)
    // =========================================================================
    expect(dbAppointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(dbAppointment.queueNumber).toBeNull();

    // =========================================================================
    // STEP 2: RECEPTION CHECK-IN (SRS-REC-01 -> CHECKED_IN)
    // =========================================================================
    // Receptionist checks in the patient: allocates queue number 1
    dbAppointment.status = AppointmentStatus.CHECKED_IN;
    dbAppointment.queueNumber = 1;
    dbAppointment.checkedInAt = new Date('2026-09-28T07:55:00Z');

    // Emit WebSocket statusChanged event
    await queueEventsService.statusChanged(
      dbAppointment.id,
      AppointmentStatus.CONFIRMED,
      'RECEPTION_CHECKIN',
    );

    // Verify WebSocket broadcast to Doctor room, Reception room & TV Board
    expect(queueGateway.emitToRoom).toHaveBeenCalledWith(
      QUEUE_DOCTOR_ROOM(DOCTOR_ID),
      APPOINTMENT_STATUS_CHANGED_EVENT,
      expect.objectContaining({
        appointmentId: APPOINTMENT_ID,
        status: AppointmentStatus.CHECKED_IN,
        queueNumber: 1,
      }),
    );
    expect(queueGateway.emitToRoom).toHaveBeenCalledWith(
      QUEUE_PUBLIC_ROOM,
      QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        queueNumber: 1,
        status: AppointmentStatus.CHECKED_IN,
      }),
    );

    // =========================================================================
    // STEP 3: DOCTOR HANDOVER (SRS-DOC-02 -> IN_CONSULTATION)
    // =========================================================================
    const updatedAppointment = await lifecycleService.transition(
      APPOINTMENT_ID,
      AppointmentStatus.IN_CONSULTATION,
      { userId: DOCTOR_USER_ID, role: Role.DOCTOR },
    );

    expect(updatedAppointment.status).toBe(AppointmentStatus.IN_CONSULTATION);
    expect(dbAppointment.status).toBe(AppointmentStatus.IN_CONSULTATION);

    // =========================================================================
    // STEP 4: DRUG SAFETY CHECK - ALLERGY DETECTION (SRS-DOC-04)
    // =========================================================================
    const allergicItem: CreatePrescriptionItemDto = {
      medicineName: 'Augmentin 1g (Amoxicillin + Clavulanate)',
      activeIngredient: 'Amoxicillin',
      unit: 'Viên',
      dosageMorning: '1',
      dosageNoon: '0',
      dosageAfternoon: '0',
      dosageNight: '1',
      usageInstructions: 'Uống sau ăn',
      totalQuantity: 14,
      durationDays: 7,
    };

    // Patient has allergy 'Penicillin', medicine is Augmentin (Amoxicillin)
    const safetyCheckResult = await clinicalService.checkPrescriptionSafetyEndpoint(
      DOCTOR_USER_ID,
      {
        appointmentId: APPOINTMENT_ID,
        icd10PrimaryCode: 'J45.9',
        items: [allergicItem],
      },
    );

    expect(safetyCheckResult.hasWarning).toBe(true);
    expect(safetyCheckResult.warnings.length).toBe(1);
    expect(safetyCheckResult.warnings[0].warningMessage).toContain('penicillin');
    expect(safetyCheckResult.warnings[0].warningMessage).toContain('Augmentin');

    // =========================================================================
    // STEP 5: DRUG SAFETY CHECK - 30-DAY CHRONIC LIMIT (Circular 52/2017/TT-BYT)
    // =========================================================================
    // Chronic patient (Hen phế quản J45.9) with prescription for 45 days => REJECT
    const excessiveChronicItem: CreatePrescriptionItemDto = {
      medicineName: 'Salbutamol 2mg',
      activeIngredient: 'Salbutamol sulfate',
      unit: 'Viên',
      dosageMorning: '1',
      dosageNoon: '0',
      dosageAfternoon: '0',
      dosageNight: '1',
      usageInstructions: 'Uống sau ăn',
      totalQuantity: 90, // 90 / 2 = 45 days (> 30 days)
      durationDays: 45,
    };

    await expect(
      clinicalService.checkPrescriptionSafety(
        PATIENT_USER_ID,
        [excessiveChronicItem],
        'J45.9',
      ),
    ).rejects.toThrow(BadRequestException);

    // Valid compliant prescription: 30 days => ACCEPT
    const validChronicItem: CreatePrescriptionItemDto = {
      medicineName: 'Salbutamol 2mg',
      activeIngredient: 'Salbutamol sulfate',
      unit: 'Viên',
      dosageMorning: '1',
      dosageNoon: '0',
      dosageAfternoon: '0',
      dosageNight: '1',
      usageInstructions: 'Uống sau ăn',
      totalQuantity: 60, // 60 / 2 = 30 days (<= 30 days)
      durationDays: 30,
    };

    const validSafetyResult = await clinicalService.checkPrescriptionSafety(
      PATIENT_USER_ID,
      [validChronicItem],
      'J45.9',
    );
    expect(validSafetyResult.hasWarning).toBe(false);

    // =========================================================================
    // STEP 6: RECORD EMR & COMPLETE CONSULTATION (SRS-DOC-03)
    // =========================================================================
    const createEmrDto: CreateMedicalRecordDto = {
      appointmentId: APPOINTMENT_ID,
      icd10PrimaryCode: 'J45.9',
      icd10SecondaryCodes: 'I10',
      clinicalNotes: 'Bệnh nhân có triệu chứng khò khè, khó thở về đêm.',
      doctorAdvice: 'Tránh tiếp xúc lông động vật, dùng thuốc xịt đúng kỹ thuật.',
      followUpDate: '2026-10-28',
      vitalSigns: {
        bloodPressure: '120/80',
        pulse: 76,
        temperature: 36.8,
        respiratoryRate: 18,
        weight: 65,
        height: 170,
      },
      prescriptionItems: [validChronicItem],
    };

    const record = await clinicalService.createMedicalRecord(
      DOCTOR_USER_ID,
      createEmrDto,
    );

    expect(record).toBeDefined();
    expect(record.icd10PrimaryCode).toBe('J45.9');
    expect(record.vitalSigns?.bmi).toBe(22.49);

    // Doctor completes consultation => status becomes COMPLETED
    const completedAppointment = await lifecycleService.transition(
      APPOINTMENT_ID,
      AppointmentStatus.COMPLETED,
      { userId: DOCTOR_USER_ID, role: Role.DOCTOR },
    );
    expect(completedAppointment.status).toBe(AppointmentStatus.COMPLETED);

    // Record completedAt on the medical record
    dbMedicalRecord.completedAt = new Date('2026-09-28T08:25:00Z');

    // =========================================================================
    // STEP 7: EMR IMMUTABILITY & 24-HOUR AUTO-LOCK (Section 5.4 & TT 46/2018)
    // =========================================================================
    // Simulate time elapsed > 24 hours
    dbMedicalRecord.completedAt = new Date('2026-09-25T08:00:00Z'); // 3 days ago

    // Attempting direct update after 24h MUST be rejected with BadRequestException
    await expect(
      clinicalService.updateMedicalRecord(DOCTOR_USER_ID, record.id, {
        clinicalNotes: 'Cố tình sửa trực tiếp bệnh án sau 24h',
      }),
    ).rejects.toThrow(BadRequestException);

    // =========================================================================
    // STEP 8: EMR ADDENDUM CREATION & AUDIT CHAINING (Section 5.4)
    // =========================================================================
    const addendum = await clinicalService.createEmrAddendum(
      DOCTOR_USER_ID,
      record.id,
      {
        reason: 'Bổ sung kết quả đo chức năng thông khí phổi (Spirometry)',
        clinicalNotes: 'FVC 85%, FEV1 78%, đáp ứng nghiệm pháp giãn phế quản dương tính.',
        doctorAdvice: 'Tiếp tục phác đồ ICS-LABA.',
        followUpDate: '2026-10-28',
      },
    );

    expect(addendum).toBeDefined();
    expect(addendum.reason).toBe('Bổ sung kết quả đo chức năng thông khí phổi (Spirometry)');
    expect(addendum.doctorId).toBe(DOCTOR_ID);
    expect(addendum.doctorName).toBe('BS. Lê Cường');
    expect(addendum.doctorLicenseNumber).toBe('CCHN-0012345/HN');

    // Verify snapshot immutability
    expect(addendum.previousContent.clinicalNotes).toBe(
      'Bệnh nhân có triệu chứng khò khè, khó thở về đêm.',
    );
    expect(addendum.updatedContent.clinicalNotes).toBe(
      'FVC 85%, FEV1 78%, đáp ứng nghiệm pháp giãn phế quản dương tính.',
    );

    // Verify history inspection endpoint
    const history = await clinicalService.getEmrHistory(DOCTOR_USER_ID, Role.DOCTOR, record.id);
    expect(history.isLocked).toBe(true);
    expect(history.addendums.length).toBe(1);
    expect(history.addendums[0].reason).toContain('Spirometry');
  });
});
