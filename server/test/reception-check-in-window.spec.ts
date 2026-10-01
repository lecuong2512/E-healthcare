import { AppointmentStatus, PaymentMethod, PaymentStatus, SlotStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { checkInWindowStatus } from '../src/modules/reception/check-in-window';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { QueueNumberService } from '../src/modules/reception/queue-number.service';
import { ReceptionAuditService } from '../src/modules/reception/reception-audit.service';
import { ReceptionService } from '../src/modules/reception/reception.service';

describe('Vietnam check-in window', () => {
  const schedule = { date: '2026-09-22', startTime: '10:00:00', endTime: '10:30:00' };

  it('opens exactly 60 minutes before the slot and closes 15 minutes after it ends', () => {
    expect(checkInWindowStatus(schedule, { date: schedule.date, time: '08:59:59' })).toBe('TOO_EARLY');
    expect(checkInWindowStatus(schedule, { date: schedule.date, time: '09:00:00' })).toBe('OPEN');
    expect(checkInWindowStatus(schedule, { date: schedule.date, time: '10:45:00' })).toBe('OPEN');
    expect(checkInWindowStatus(schedule, { date: schedule.date, time: '10:45:01' })).toBe('TOO_LATE');
  });

  it('never accepts a different Vietnam calendar day', () => {
    expect(checkInWindowStatus(schedule, { date: '2026-09-21', time: '10:00:00' })).toBe('OTHER_DAY');
    expect(checkInWindowStatus(schedule, { date: '2026-09-23', time: '00:00:00' })).toBe('OTHER_DAY');
  });

  it('uses Vietnam time rather than the server UTC date', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-21T17:30:00.000Z'));
      expect(checkInWindowStatus({
        date: '2026-09-22', startTime: '01:00:00', endTime: '01:30:00',
      })).toBe('OPEN');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the same check-in window in reception lookup', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-22T02:00:00.000Z'));
      const appointment = {
        id: 'appointment-1', appointmentCode: 'APT-260922-1234',
        status: AppointmentStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.PAY_AT_CLINIC, totalAmount: 300000,
        patientId: 'patient-1', patient: { fullName: 'Patient', phoneNumber: '0912345678' },
        doctorId: 'doctor-1', doctor: {
          user: { fullName: 'Doctor' }, specialty: { name: 'General' }, roomNumber: 'P1',
        },
        schedule: { ...schedule, startTime: '11:00:00', endTime: '11:30:00', status: SlotStatus.BOOKED },
        queueNumber: null, checkedInAt: null,
      } as AppointmentEntity;
      const builder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(), getMany: jest.fn(async () => [appointment]),
      };
      const database = {
        getRepository: () => ({ createQueryBuilder: () => builder }), manager: {},
      } as unknown as DataSource;
      const service = new ReceptionService(
        database, {} as QueueNumberService, {} as QueueEventsService,
        { record: jest.fn(async () => undefined) } as unknown as ReceptionAuditService,
      );
      const context = { actorId: 'receptionist', ip: null, userAgent: null };

      const [early] = await service.lookup({ code: appointment.appointmentCode }, context);
      expect(early).toMatchObject({ canCheckIn: false, blockedReason: expect.stringContaining('60 phút') });

      appointment.schedule.startTime = '10:00:00';
      appointment.schedule.endTime = '10:30:00';
      const [open] = await service.lookup({ code: appointment.appointmentCode }, context);
      expect(open).toMatchObject({ canCheckIn: true, blockedReason: null });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects an early check-in before allocating a queue number', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-22T02:00:00.000Z'));
      const appointment = {
        id: 'appointment-1', status: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID, scheduleId: 'schedule-1', doctorId: 'doctor-1',
      } as AppointmentEntity;
      const builder = {
        setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => appointment),
      };
      const manager = {
        getRepository: jest.fn((entity) => entity === AppointmentEntity
          ? { createQueryBuilder: () => builder }
          : entity === DoctorScheduleEntity
            ? { findOneBy: async () => ({
              ...schedule, startTime: '11:00:00', endTime: '11:30:00',
              status: SlotStatus.BOOKED, doctorId: 'doctor-1',
            }) }
            : null),
      };
      const dataSource = {
        transaction: jest.fn(async (_isolation, work) => work(manager)),
      } as unknown as DataSource;
      const allocate = jest.fn();
      const service = new ReceptionService(
        dataSource, { allocate } as unknown as QueueNumberService,
        {} as QueueEventsService, {} as ReceptionAuditService,
      );

      await expect(service.checkIn(appointment.id, {
        actorId: 'receptionist', ip: null, userAgent: null,
      })).rejects.toMatchObject({ status: 409 });
      expect(allocate).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
