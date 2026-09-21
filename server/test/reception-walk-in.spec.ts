import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CounterPaymentMethod, Gender, Role, SlotStatus } from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { PersonalHealthProfileEntity, UserRoleEntity } from '../src/database/entities/auth.entity';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { BookingService } from '../src/modules/booking/booking.service';
import { CounterPaymentService } from '../src/modules/reception/counter-payment.service';
import { QueueNumberService } from '../src/modules/reception/queue-number.service';
import { WalkInService } from '../src/modules/reception/walk-in.service';
import { RedisService } from '../src/common/redis/redis.service';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { ReceptionAuditContext, ReceptionAuditService } from '../src/modules/reception/reception-audit.service';

jest.mock('../src/common/utils/vn-time.util', () => ({
  vietnamNow: () => ({ date: '2026-09-21', time: '09:00:00' }),
}));

describe('WalkInService', () => {
  const doctorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const scheduleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const receptionistId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const auditContext: ReceptionAuditContext = { actorId: receptionistId, ip: '127.0.0.1', userAgent: 'jest' };
  const key = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const slot = {
    id: scheduleId,
    doctorId,
    date: '2026-09-21',
    startTime: '10:00:00',
    endTime: '10:30:00',
    status: SlotStatus.AVAILABLE,
    doctor: {
      user: { fullName: 'Bac Si B' },
      specialty: { name: 'Noi khoa' },
      roomNumber: 'P203',
      consultationFee: 300000,
    },
  };
  const request = {
    scheduleId,
    fullName: 'Nguyen Van A',
    phone: '0912345678',
    birthYear: 1989,
    gender: Gender.MALE,
    reasonForVisit: 'Dau dau',
    paymentMethod: CounterPaymentMethod.CASH,
    amountTendered: 500000,
  };
  const receipt = {
    receiptCode: 'RC-1',
    transactionCode: 'TX-1',
    appointmentCode: 'APT-260921-1234',
    patientName: request.fullName,
    doctorName: 'Bac Si B',
    amount: 300000,
    amountTendered: 500000,
    changeAmount: 200000,
    paymentMethod: CounterPaymentMethod.CASH,
    collectedBy: 'Le Tan A',
    paidAt: '2026-09-21T03:00:00.000Z',
  };

  let service: WalkInService;
  let redis: { get: jest.Mock; setNxEx: jest.Mock; releaseLockIfOwner: jest.Mock };
  let payments: { recordCashPayment: jest.Mock; getReceipt: jest.Mock };
  let queueEvents: { statusChanged: jest.Mock };
  let dataSource: { getRepository: jest.Mock; transaction: jest.Mock };
  let savedAppointment: AppointmentEntity | null;
  let existingPatients: UserEntity[];
  let remainingCodeCollisions: number;

  beforeEach(() => {
    savedAppointment = null;
    existingPatients = [];
    remainingCodeCollisions = 0;
    redis = {
      get: jest.fn(async () => null),
      setNxEx: jest.fn(async () => true),
      releaseLockIfOwner: jest.fn(async () => true),
    };
    payments = {
      recordCashPayment: jest.fn(async () => receipt),
      getReceipt: jest.fn(async () => receipt),
    };
    queueEvents = { statusChanged: jest.fn(async () => undefined) };
    const scheduleQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ ...slot })),
    };
    const userQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => existingPatients),
    };
    const appointmentQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === DoctorScheduleEntity) {
          return { createQueryBuilder: () => scheduleQuery };
        }
        if (entity === DoctorEntity) {
          return { findOneBy: async () => ({ consultationFee: 300000 }) };
        }
        if (entity === UserEntity) {
          return {
            createQueryBuilder: () => userQuery,
            create: (value: UserEntity) => value,
            save: async (value: UserEntity) => ({ ...value, id: 'patient-1' }),
          };
        }
        if (entity === UserRoleEntity) {
          return {
            findOneBy: async () => ({ role: Role.PATIENT }),
            save: async (value: UserRoleEntity) => value,
          };
        }
        if (entity === PersonalHealthProfileEntity) {
          return { save: async (value: PersonalHealthProfileEntity) => value };
        }
        if (entity === AppointmentEntity) {
          return {
            createQueryBuilder: () => appointmentQuery,
            create: (value: AppointmentEntity) => value,
            save: async (value: AppointmentEntity) => {
              if (remainingCodeCollisions-- > 0) {
                throw new QueryFailedError('INSERT INTO appointments', [], Object.assign(new Error('duplicate'), {
                  code: '23505',
                  constraint: 'idx_appointments_appointment_code',
                }));
              }
              savedAppointment = { ...value, id: 'appointment-1' };
              return savedAppointment;
            },
          };
        }
        throw new Error('Unexpected repository');
      }),
      save: jest.fn(async (_entity, value) => value),
      query: jest.fn(async () => []),
    };
    dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === AppointmentEntity) {
          return { findOneBy: async () => savedAppointment };
        }
        if (entity === DoctorScheduleEntity) {
          return {
            findOneBy: async () => ({ ...slot }),
            createQueryBuilder: () => ({
              innerJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: async () => [{ ...slot }],
            }),
          };
        }
        throw new Error('Unexpected repository');
      }),
      transaction: jest.fn(async (_isolation, work) => work(manager)),
    };
    service = new WalkInService(
      dataSource as unknown as DataSource,
      redis as unknown as RedisService,
      { allocate: jest.fn(async () => 7) } as unknown as QueueNumberService,
      payments as unknown as CounterPaymentService,
      queueEvents as unknown as QueueEventsService,
      { record: jest.fn(async () => undefined) } as unknown as ReceptionAuditService,
    );
  });

  it('loại slot đang Redis hold khỏi danh sách bác sĩ', async () => {
    redis.get.mockResolvedValueOnce('another-holder');
    expect(await service.availableDoctors({})).toEqual([]);
    expect(redis.get).toHaveBeenCalledWith(
      BookingService.formatSlotLockKey(doctorId, scheduleId),
    );
  });

  it('báo lỗi khi Redis không kiểm tra được slot đang giữ', async () => {
    redis.get.mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.availableDoctors({})).rejects.toThrow(ServiceUnavailableException);
  });

  it('không mở giao dịch nếu Redis không khóa được slot walk-in', async () => {
    redis.setNxEx.mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.book(request, auditContext, key)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('trả kết quả cũ khi gửi lại cùng Idempotency-Key', async () => {
    const first = await service.book(request, auditContext, key);
    const second = await service.book(request, auditContext, key);

    expect(first).toEqual(second);
    expect(first.queueNumber).toBe(7);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(payments.recordCashPayment).toHaveBeenCalledTimes(1);
    expect(queueEvents.statusChanged).toHaveBeenCalledTimes(1);
    expect(redis.setNxEx).toHaveBeenCalledTimes(1);
    const acquiredToken = redis.setNxEx.mock.calls[0][1];
    expect(redis.releaseLockIfOwner).toHaveBeenCalledWith(
      BookingService.formatSlotLockKey(doctorId, scheduleId),
      acquiredToken,
    );
  });

  it('từ chối slot đang được giữ mà không mở giao dịch DB', async () => {
    redis.setNxEx.mockResolvedValue(false);
    await expect(service.book(request, auditContext, key)).rejects.toThrow(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('từ chối dùng lại Idempotency-Key với dữ liệu khác', async () => {
    await service.book(request, auditContext, key);
    await expect(service.book(
      { ...request, amountTendered: 600000 }, auditContext, key,
    )).rejects.toThrow(ConflictException);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('không gắn lịch vào hồ sơ cùng số điện thoại nhưng khác danh tính', async () => {
    existingPatients = [{
      id: 'existing-patient',
      fullName: 'Nguoi Khac',
      gender: Gender.MALE,
      dateOfBirth: '1989-01-01',
    } as UserEntity];
    await expect(service.book(request, auditContext, key)).rejects.toThrow(
      ConflictException,
    );
    expect(payments.recordCashPayment).not.toHaveBeenCalled();
    expect(queueEvents.statusChanged).not.toHaveBeenCalled();
    expect(redis.releaseLockIfOwner).toHaveBeenCalledTimes(1);
  });

  it('giải phóng Redis lock khi giao dịch thất bại', async () => {
    payments.recordCashPayment.mockRejectedValue(new Error('payment failed'));
    await expect(service.book(request, auditContext, key)).rejects.toThrow(
      'payment failed',
    );
    expect(redis.releaseLockIfOwner).toHaveBeenCalledTimes(1);
  });

  it('thử mã lịch hẹn khác khi mã đầu bị trùng', async () => {
    remainingCodeCollisions = 1;
    const response = await service.book(request, auditContext, key);
    expect(response.appointmentId).toBe('appointment-1');
    expect(payments.recordCashPayment).toHaveBeenCalledTimes(1);
  });
});
