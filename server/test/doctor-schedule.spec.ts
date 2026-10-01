import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShiftType, SlotStatus } from '@shared/enums';
import { DoctorScheduleService } from '../src/modules/doctor/doctor-schedule.service';
import { DoctorCacheService } from '../src/modules/doctor/doctor-cache.service';

describe('DoctorScheduleService', () => {
  const cache = {
    invalidateDoctorData: jest.fn().mockResolvedValue(undefined),
  } as unknown as DoctorCacheService;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('blocks next-week registration at the configured Friday deadline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-18T10:00:00.000Z'));
    const service = new DoctorScheduleService({} as DataSource, cache);

    await expect(
      service.createSchedule('doctor-id', {
        date: '2026-09-21',
        shiftType: ShiftType.MORNING,
        slotDurationMinutes: 30,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('splits a morning shift into AVAILABLE 30-minute slots and returns the room', async () => {
    const doctorRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'doctor-id', roomNumber: 'P.201' }),
    };
    const overlapQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => overlapQuery),
      })),
      create: jest.fn((_entity: unknown, value: Record<string, unknown>) => ({
        id: 'slot-id',
        ...value,
      })),
      save: jest.fn(async (values: unknown[]) => values),
    };
    const dataSource = {
      getRepository: jest.fn(() => doctorRepository),
      transaction: jest.fn(
        async (work: (value: typeof manager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;
    const service = new DoctorScheduleService(dataSource, cache);

    const result = await service.createSchedule('doctor-id', {
      date: '2099-01-05',
      shiftType: ShiftType.MORNING,
      slotDurationMinutes: 30,
    });

    expect(result.roomNumber).toBe('P.201');
    expect(result.slots).toHaveLength(8);
    expect(result.slots[0]).toMatchObject({
      startTime: '08:00:00',
      endTime: '08:30:00',
      status: SlotStatus.AVAILABLE,
    });
  });

  it('blocks editing a BOOKED slot', async () => {
    const repository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'schedule-id',
        doctorId: 'doctor-id',
        status: SlotStatus.BOOKED,
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (
          work: (value: {
            getRepository: jest.Mock;
          }) => Promise<unknown>,
        ) => work({ getRepository: jest.fn(() => repository) }),
      ),
    } as unknown as DataSource;
    const service = new DoctorScheduleService(dataSource, cache);

    await expect(
      service.updateSchedule('doctor-id', 'schedule-id', { version: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('DoctorSelfScheduleController', () => {
  const service = {
    getSchedules: jest.fn().mockResolvedValue({ doctorId: 'doc-1', roomNumber: '204', slots: [] }),
    createSchedule: jest.fn().mockResolvedValue({ doctorId: 'doc-1', roomNumber: '204', slots: [] }),
    deleteSchedule: jest.fn().mockResolvedValue(undefined),
  };

  const doctorRepository = {
    findOneBy: jest.fn().mockImplementation(({ userId }: { userId: string }) => {
      if (userId === 'user-doctor') {
        return Promise.resolve({ id: 'doc-1', userId: 'user-doctor', roomNumber: '204' });
      }
      return Promise.resolve(null);
    }),
  };

  const dataSource = {
    getRepository: jest.fn(() => doctorRepository),
  } as unknown as DataSource;

  const controller = new (require('../src/modules/doctor/doctor-schedule.controller').DoctorSelfScheduleController)(
    service,
    dataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('gets schedules for the currently authenticated doctor', async () => {
    const req = { auth: { userId: 'user-doctor', role: 'DOCTOR' } } as any;
    const result = await controller.getMySchedules(req, { from: '2026-10-01', to: '2026-10-07' });

    expect(doctorRepository.findOneBy).toHaveBeenCalledWith({ userId: 'user-doctor' });
    expect(service.getSchedules).toHaveBeenCalledWith('doc-1', { from: '2026-10-01', to: '2026-10-07' });
    expect(result).toEqual({ doctorId: 'doc-1', roomNumber: '204', slots: [] });
  });

  it('creates schedule for the currently authenticated doctor', async () => {
    const req = { auth: { userId: 'user-doctor', role: 'DOCTOR' } } as any;
    const dto = { date: '2026-10-05', shiftType: ShiftType.MORNING, slotDurationMinutes: 30 };
    await controller.createSchedule(req, dto);

    expect(doctorRepository.findOneBy).toHaveBeenCalledWith({ userId: 'user-doctor' });
    expect(service.createSchedule).toHaveBeenCalledWith('doc-1', dto);
  });

  it('deletes schedule for the currently authenticated doctor', async () => {
    const req = { auth: { userId: 'user-doctor', role: 'DOCTOR' } } as any;
    await controller.deleteSchedule(req, 'schedule-1');

    expect(doctorRepository.findOneBy).toHaveBeenCalledWith({ userId: 'user-doctor' });
    expect(service.deleteSchedule).toHaveBeenCalledWith('doc-1', 'schedule-1');
  });

  it('throws NotFoundException when doctor profile is not found', async () => {
    const req = { auth: { userId: 'unknown-user', role: 'DOCTOR' } } as any;
    await expect(controller.getMySchedules(req, {})).rejects.toThrow();
  });
});

