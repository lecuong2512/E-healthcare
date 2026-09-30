import './test-environment';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { AppointmentCronService, NO_SHOW_GRACE_MINUTES } from '../src/modules/notification/schedulers/appointment-cron.service';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { AppointmentStatus, SlotStatus } from '@shared/enums';
import { RedisService } from '../src/common/redis/redis.service';
import { NotificationProducerService } from '../src/modules/notification/producers/notification-producer.service';
import { AppointmentNotificationEntity } from '../src/database/entities/appointment-notification.entity';
import { isWithinReminderWindow, localScheduleToInstant } from '../src/modules/notification/schedulers/appointment-cron.service';

describe('AppointmentCronService Schedulers (Section 5.2, Section 7.1, SRS-PAT-05)', () => {
  let cronService: AppointmentCronService;
  let mockAppointmentRepo: Partial<Repository<AppointmentEntity>>;
  let mockScheduleRepo: Partial<Repository<DoctorScheduleEntity>>;
  let mockRedisStore: Map<string, { value: string; ttl: number }>;
  let mockRedisService: Partial<RedisService>;
  let mockProducerService: Partial<NotificationProducerService>;
  let mockNotificationRepo: Partial<Repository<AppointmentNotificationEntity>>;
  let notificationRows: any[];
  let notificationSequence: number;

  beforeEach(async () => {
    mockRedisStore = new Map();
    notificationRows = [];
    notificationSequence = 0;

    mockRedisService = {
      get: jest.fn().mockImplementation(async (key: string) => {
        const item = mockRedisStore.get(key);
        return item ? item.value : null;
      }),
      setNxEx: jest.fn().mockImplementation(async (key: string, value: string, ttl: number) => {
        if (mockRedisStore.has(key)) return false;
        mockRedisStore.set(key, { value, ttl });
        return true;
      }),
      ttl: jest.fn().mockImplementation(async (key: string) => {
        const item = mockRedisStore.get(key);
        return item ? item.ttl : -2;
      }),
    };

    mockProducerService = {
      enqueueAppointmentReminder24h: jest.fn().mockResolvedValue({} as any),
      enqueueAppointmentReminder2h: jest.fn().mockResolvedValue({} as any),
    };

    mockAppointmentRepo = {
      find: jest.fn(),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    mockScheduleRepo = {
      find: jest.fn(),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    mockNotificationRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) =>
        notificationRows.find((row) => row.appointmentId === where.appointmentId && row.notificationType === where.notificationType) ?? null,
      ),
      create: jest.fn().mockImplementation((value: any) => ({
        id: `notification-${++notificationSequence}`,
        ...value,
      })),
      save: jest.fn().mockImplementation(async (value: any) => {
        const existingIndex = notificationRows.findIndex((row) => row.id === value.id);
        if (existingIndex < 0) notificationRows.push(value);
        else notificationRows[existingIndex] = value;
        return value;
      }),
      update: jest.fn().mockImplementation(async (id: string, value: any) => {
        const row = notificationRows.find((item) => item.id === id);
        if (!row) return { affected: 0 };
        Object.assign(row, value);
        return { affected: 1 };
      }),
      createQueryBuilder: jest.fn(() => {
        let updateValues: any;
        let notificationId: string;
        const builder: any = {
          update: () => builder,
          set: (value: any) => { updateValues = value; return builder; },
          where: (_query: string, params: any) => { notificationId = params.id; return builder; },
          execute: async () => {
            const row = notificationRows.find((item) => item.id === notificationId && item.status === 'FAILED');
            if (!row) return { affected: 0 };
            Object.assign(row, updateValues);
            return { affected: 1 };
          },
        };
        return builder;
      }),
    };

    const mockDataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === AppointmentEntity) return mockAppointmentRepo;
        if (entity === DoctorScheduleEntity) return mockScheduleRepo;
        if (entity === AppointmentNotificationEntity) return mockNotificationRepo;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentCronService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
        { provide: NotificationProducerService, useValue: mockProducerService },
      ],
    }).compile();

    cronService = module.get<AppointmentCronService>(AppointmentCronService);
  });

  describe('Cron 1: Quét tự động đánh dấu NO_SHOW (Section 5.2 & SRS-DOC-02)', () => {
    it('should mark CONFIRMED appointments as NO_SHOW if past 30 mins after slot end time without check-in', async () => {
      const appointments = [
        // Appt 1: slot ended at 08:30. At 09:15 (> 08:30 + 30m = 09:00), checkedInAt is null -> NO_SHOW
        {
          id: 'appt-1',
          appointmentCode: 'APT-260923-0001',
          status: AppointmentStatus.CONFIRMED,
          checkedInAt: null,
          schedule: {
            date: '2026-09-23',
            startTime: '08:00',
            endTime: '08:30',
          },
        },
        // Appt 2: slot ended at 08:30, but patient already checked in -> Should NOT be NO_SHOW
        {
          id: 'appt-2',
          appointmentCode: 'APT-260923-0002',
          status: AppointmentStatus.CONFIRMED,
          checkedInAt: new Date('2026-09-23T08:15:00'),
          schedule: {
            date: '2026-09-23',
            startTime: '08:00',
            endTime: '08:30',
          },
        },
        // Appt 3: slot ended at 09:00. At 09:15 (within 30 mins grace period <= 09:30) -> Should NOT be NO_SHOW yet
        {
          id: 'appt-3',
          appointmentCode: 'APT-260923-0003',
          status: AppointmentStatus.CONFIRMED,
          checkedInAt: null,
          schedule: {
            date: '2026-09-23',
            startTime: '08:30',
            endTime: '09:00',
          },
        },
      ];

      (mockAppointmentRepo.find as jest.Mock).mockResolvedValue(appointments);

      const referenceTime = new Date('2026-09-23T02:15:00.000Z');
      const count = await cronService.scanAndMarkNoShow(referenceTime);

      expect(count).toBe(1);
      expect(appointments[0].status).toBe(AppointmentStatus.NO_SHOW);
      expect(appointments[1].status).toBe(AppointmentStatus.CONFIRMED);
      expect(appointments[2].status).toBe(AppointmentStatus.CONFIRMED);
      expect(mockAppointmentRepo.save).toHaveBeenCalledTimes(1);
      expect(mockAppointmentRepo.save).toHaveBeenCalledWith(appointments[0]);
    });

    it('should return 0 when no appointments are overdue', async () => {
      (mockAppointmentRepo.find as jest.Mock).mockResolvedValue([]);
      const count = await cronService.scanAndMarkNoShow();
      expect(count).toBe(0);
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Cron 2: Quét dọn dẹp các slot giữ chỗ mồ côi (Orphaned Holding Slots)', () => {
    it('should restore HOLDING slots to AVAILABLE if Redis lock has expired or is absent', async () => {
      const holdingSlots = [
        // Slot 1: lock key expired (mock store does not have key) -> Orphaned, restore to AVAILABLE
        {
          id: 'slot-1',
          doctorId: 'doc-1',
          status: SlotStatus.HOLDING,
        },
        // Slot 2: lock key is still active (TTL = 300) -> Still valid holding, do not touch
        {
          id: 'slot-2',
          doctorId: 'doc-1',
          status: SlotStatus.HOLDING,
        },
      ];

      // Setup active lock for slot-2
      mockRedisStore.set('lock:doctor:doc-1:slot:slot-2', { value: 'user-abc', ttl: 300 });

      (mockScheduleRepo.find as jest.Mock).mockResolvedValue(holdingSlots);

      const restoredCount = await cronService.cleanupOrphanedHoldingSlots();

      expect(restoredCount).toBe(1);
      expect(holdingSlots[0].status).toBe(SlotStatus.AVAILABLE);
      expect(holdingSlots[1].status).toBe(SlotStatus.HOLDING);
      expect(mockScheduleRepo.save).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepo.save).toHaveBeenCalledWith(holdingSlots[0]);
    });

    it('should return 0 when there are no holding slots', async () => {
      (mockScheduleRepo.find as jest.Mock).mockResolvedValue([]);
      const count = await cronService.cleanupOrphanedHoldingSlots();
      expect(count).toBe(0);
    });
  });

  describe('Cron 3: Quét tự động nhắc hẹn T-24h & T-2h (SRS-PAT-05)', () => {
    it('schedules T-24h email and T-2h SMS once through the existing queues', async () => {
      const referenceTime = new Date('2026-09-23T03:00:00.000Z');

      const appointments = [
        // Appt 1: Exactly 24h away (tomorrow at 10:00). Patient has email.
        {
          id: 'appt-24h',
          appointmentCode: 'APT-24H-001',
          status: AppointmentStatus.CONFIRMED,
          patient: {
            id: 'pat-1',
            fullName: 'Nguyen Thi Mai',
            email: 'mai@example.com',
            phoneNumber: '0901111222',
          },
          doctor: {
            roomNumber: 'P.101',
            user: { fullName: 'Tran Thi B' },
          },
          schedule: {
            date: '2026-09-24',
            startTime: '10:00',
          },
        },
        // Appt 2: Exactly 2h away (today at 12:00). Patient has phone.
        {
          id: 'appt-2h',
          appointmentCode: 'APT-2H-002',
          status: AppointmentStatus.CONFIRMED,
          patient: {
            id: 'pat-2',
            fullName: 'Le Van Cuong',
            email: 'cuong@example.com',
            phoneNumber: '0988889999',
          },
          doctor: {
            roomNumber: 'P.205',
            user: { fullName: 'Pham Van C' },
          },
          schedule: {
            date: '2026-09-23',
            startTime: '12:00',
          },
        },
      ];

      (mockAppointmentRepo.find as jest.Mock).mockResolvedValue(appointments);

      // First run: should dispatch both 24h email and 2h SMS
      const firstRun = await cronService.scanAndDispatchReminders(referenceTime);
      expect(firstRun.scheduled24h).toBe(1);
      expect(firstRun.scheduled2h).toBe(1);

      expect(mockProducerService.enqueueAppointmentReminder24h).toHaveBeenCalledWith(expect.objectContaining({
        notificationLogId: expect.any(String),
        to: 'mai@example.com',
        patientName: 'Nguyen Thi Mai',
        appointmentCode: 'APT-24H-001',
        doctorName: 'Tran Thi B',
        date: '2026-09-24',
        time: '10:00',
        roomNumber: 'P.101',
        notes: expect.stringContaining('CCCD'),
      }));

      expect(mockProducerService.enqueueAppointmentReminder2h).toHaveBeenCalledWith(expect.objectContaining({
        notificationLogId: expect.any(String),
        phoneNumber: '0988889999',
        patientName: 'Le Van Cuong',
        appointmentCode: 'APT-2H-002',
        doctorName: 'Pham Van C',
        time: '12:00',
        roomNumber: 'P.205',
      }));

      const secondRun = await cronService.scanAndDispatchReminders(referenceTime);
      expect(secondRun.scheduled24h).toBe(0);
      expect(secondRun.scheduled2h).toBe(0);
      expect(mockProducerService.enqueueAppointmentReminder24h).toHaveBeenCalledTimes(1);
      expect(mockProducerService.enqueueAppointmentReminder2h).toHaveBeenCalledTimes(1);
      expect(notificationRows.map((row) => row.status)).toEqual(['SCHEDULED', 'SCHEDULED']);
    });

    it('does not schedule reminders for cancelled appointments', async () => {
      (mockAppointmentRepo.find as jest.Mock).mockResolvedValue([{
        id: 'cancelled', appointmentCode: 'APT-CANCELLED',
        status: AppointmentStatus.CANCELLED_BY_PATIENT,
        patient: { fullName: 'Patient', email: 'patient@example.test', phoneNumber: '0901234567' },
        doctor: { user: { fullName: 'Doctor' }, roomNumber: 'A1' },
        schedule: { date: '2026-09-24', startTime: '10:00' },
      }]);
      const result = await cronService.scanAndDispatchReminders(new Date('2026-09-23T03:00:00Z'));
      expect(result).toEqual({ scheduled24h: 0, scheduled2h: 0 });
      expect(notificationRows).toHaveLength(0);
      expect(mockProducerService.enqueueAppointmentReminder24h).not.toHaveBeenCalled();
      expect(mockProducerService.enqueueAppointmentReminder2h).not.toHaveBeenCalled();
    });

    it('uses the configured business timezone at a date boundary', () => {
      expect(localScheduleToInstant('2026-09-24', '00:15', 'Asia/Ho_Chi_Minh')?.toISOString())
        .toBe('2026-09-23T17:15:00.000Z');
      expect(isWithinReminderWindow(
        new Date('2026-09-23T17:15:00.000Z'),
        new Date('2026-09-22T17:15:00.000Z'),
        24,
        0,
      )).toBe(true);
      expect(localScheduleToInstant('2026-03-08', '02:30', 'America/New_York')).toBeNull();
    });

    it('retries a failed queue submission from the persisted notification log', async () => {
      (mockAppointmentRepo.find as jest.Mock).mockResolvedValue([{
        id: 'retry-24h', appointmentCode: 'APT-RETRY', status: AppointmentStatus.CONFIRMED,
        patient: { fullName: 'Patient', email: 'patient@example.test', phoneNumber: null },
        doctor: { user: { fullName: 'Doctor' }, roomNumber: 'A1' },
        schedule: { date: '2026-09-24', startTime: '10:00' },
      }]);
      (mockProducerService.enqueueAppointmentReminder24h as jest.Mock)
        .mockRejectedValueOnce(new Error('queue down'))
        .mockResolvedValueOnce({} as any);

      await cronService.scanAndDispatchReminders(new Date('2026-09-23T03:00:00Z'));
      expect(notificationRows[0].status).toBe('FAILED');
      await cronService.scanAndDispatchReminders(new Date('2026-09-23T03:15:00Z'));
      expect(notificationRows[0].status).toBe('SCHEDULED');
      expect(mockProducerService.enqueueAppointmentReminder24h).toHaveBeenCalledTimes(2);
    });
  });
});
