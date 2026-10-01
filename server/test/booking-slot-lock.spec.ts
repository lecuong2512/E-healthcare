import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import request from 'supertest';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  SlotStatus,
} from '@shared/enums';
import { REQUIRED_ROLES } from '../src/common/decorators/auth.decorators';
import { RedisService } from '../src/common/redis/redis.service';
import { configureApp } from '../src/configure-app';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { PersonalHealthProfileEntity, UserRoleEntity } from '../src/database/entities/auth.entity';
import { BookingController } from '../src/modules/booking/booking.controller';
import { BookingService } from '../src/modules/booking/booking.service';

class MockRedisClient {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async set(
    key: string,
    value: string,
    mode?: string,
    ttlSeconds?: number,
    flag?: string,
  ): Promise<string | null> {
    const existing = this.store.get(key);
    if (flag === 'NX' && existing && existing.expiresAt > Date.now()) return null;
    const ttl = mode === 'EX' && ttlSeconds ? ttlSeconds * 1000 : 600_000;
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return -2;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  async eval(
    _script: string,
    numKeys: number,
    ...args: string[]
  ): Promise<number> {
    if (numKeys === 2 && args.length === 5) {
      const [lockKey, metadataKey, owner, metadata, ttl] = args;
      const existing = this.store.get(lockKey);
      if (existing && existing.expiresAt > Date.now()) return 0;
      const expiresAt = Date.now() + Number(ttl) * 1000;
      this.store.set(lockKey, { value: owner, expiresAt });
      this.store.set(metadataKey, { value: metadata, expiresAt });
      return 1;
    }
    const [lockKey, metadataKeyOrOwner, ownerForReservation] = args;
    const owner = numKeys === 2 ? ownerForReservation : metadataKeyOrOwner;
    const entry = this.store.get(lockKey);
    if (!entry || entry.expiresAt <= Date.now() || entry.value !== owner) return 0;
    this.store.delete(lockKey);
    if (numKeys === 2) this.store.delete(metadataKeyOrOwner);
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

@Injectable()
class BookingRoleTestGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      auth?: { userId: string; role: Role };
    }>();
    const role = request.headers['x-test-role'] as Role | undefined;
    if (!role) throw new UnauthorizedException();
    const required = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !required.includes(role)) throw new ForbiddenException();
    request.auth = { userId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f', role };
    return true;
  }
}

describe('Secure distributed slot reservation', () => {
  const doctorId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const slotId = 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e';
  const patientA = 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f';
  const patientB = 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a';
  let redis: RedisService;
  let service: BookingService;
  let queryRunner: Partial<QueryRunner>;
  let slotStatus: SlotStatus;
  let slotExists: boolean;
  const originalPaymentTimeout = process.env.PAYMENT_TIMEOUT_SECONDS;

  beforeEach(() => {
    slotStatus = SlotStatus.AVAILABLE;
    slotExists = true;
    redis = new RedisService(new MockRedisClient() as never);
    const slotRepository: Partial<Repository<DoctorScheduleEntity>> = {
      findOne: jest.fn(async () =>
        slotExists
          ? (({
              id: slotId,
              doctorId,
              status: slotStatus,
              date: '2099-01-01',
              startTime: '09:00:00',
            }) as DoctorScheduleEntity)
          : null,
      ),
    };
    const scheduleQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: slotId,
        doctorId,
        status: SlotStatus.AVAILABLE,
        date: '2099-01-01',
        startTime: '09:00:00',
      }),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        getRepository: jest.fn((entity) => {
          if (entity === DoctorScheduleEntity) {
            return { createQueryBuilder: () => scheduleQuery };
          }
          if (entity === DoctorEntity) {
            return { findOne: jest.fn().mockResolvedValue({ id: doctorId, consultationFee: 300_000 }) };
          }
          if (entity === UserEntity) {
            return {
              findOneBy: jest.fn().mockResolvedValue({ id: patientA, fullName: 'Nguyễn An' }),
              find: jest.fn().mockResolvedValue([]),
              create: jest.fn((val) => val),
              save: jest.fn((val) => Promise.resolve({ id: 'dependent-user-id', ...val })),
            };
          }
          if (entity === UserRoleEntity || entity === PersonalHealthProfileEntity) {
            return {
              save: jest.fn().mockResolvedValue({}),
            };
          }
          return {};
        }),
        create: jest.fn((_entity, value) => value),
        save: jest.fn((entity, value) =>
          Promise.resolve(
            entity === AppointmentEntity ? { id: 'appointment-id', ...value } : (value?.id ? value : { id: 'dependent-user-id', ...value }),
          ),
        ),
      } as never,
    };
    const dataSource = {
      isInitialized: true,
      getRepository: jest.fn(() => slotRepository),
      createQueryRunner: jest.fn(() => queryRunner),
    } as unknown as DataSource;
    service = new BookingService(redis, dataSource);
  });

  afterEach(() => {
    if (originalPaymentTimeout === undefined) delete process.env.PAYMENT_TIMEOUT_SECONDS;
    else process.env.PAYMENT_TIMEOUT_SECONDS = originalPaymentTimeout;
  });

  it('uses a unique reservation ID as the Redis owner without exposing patient ID', async () => {
    const result = await service.reserveSlot({ doctorId, slotId }, patientA);
    const lockKey = BookingService.formatSlotLockKey(doctorId, slotId);

    expect(result.data.reservationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await redis.get(lockKey)).toBe(result.data.reservationId);
    expect(JSON.stringify(result)).not.toContain(patientA);
  });

  it('allows only one winner under concurrent contention', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        service.reserveSlot({ doctorId, slotId }, `patient-${index}`),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(19);
  });

  it('rejects a reservation when the database slot is already holding', async () => {
    slotStatus = SlotStatus.HOLDING;

    await expect(service.reserveSlot({ doctorId, slotId }, patientA)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('does not create Redis keys for a nonexistent database slot', async () => {
    slotExists = false;

    await expect(service.reserveSlot({ doctorId, slotId }, patientA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await redis.get(BookingService.formatSlotLockKey(doctorId, slotId))).toBeNull();
  });

  it('uses the configured payment timeout for reservation TTL and expiry', async () => {
    process.env.PAYMENT_TIMEOUT_SECONDS = '900';
    const before = Date.now();

    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);

    expect(reservation.data.ttlSeconds).toBe(900);
    expect(new Date(reservation.data.expiresAt).getTime() - before).toBeGreaterThanOrEqual(
      899_000,
    );
  });

  it('prevents another patient from releasing or confirming a stolen reservation ID', async () => {
    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    const dto = { doctorId, slotId, reservationId: reservation.data.reservationId };

    await expect(service.releaseSlot(dto, patientB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.confirmBooking(
        {
          ...dto,
          reasonForVisit: 'Unauthorized booking',
          paymentMethod: PaymentMethod.VNPAY,
        },
        patientB,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.getSlotLockStatus(doctorId, slotId)).isLocked).toBe(true);
  });

  it('releases only the matching reservation owner', async () => {
    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    const wrongRelease = await service.releaseSlot(
      { doctorId, slotId, reservationId: '95276349-390f-4ebc-b62b-5c96f60cf899' },
      patientB,
    );
    expect(wrongRelease.success).toBe(false);
    expect((await service.getSlotLockStatus(doctorId, slotId)).isLocked).toBe(true);

    const ownerRelease = await service.releaseSlot(
      { doctorId, slotId, reservationId: reservation.data.reservationId },
      patientA,
    );
    expect(ownerRelease.success).toBe(true);
  });

  it('does not let an old reservation delete a newer lock', async () => {
    const oldReservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    await service.releaseSlot(
      { doctorId, slotId, reservationId: oldReservation.data.reservationId },
      patientA,
    );
    const newReservation = await service.reserveSlot({ doctorId, slotId }, patientA);

    await service.releaseSlot(
      { doctorId, slotId, reservationId: oldReservation.data.reservationId },
      patientA,
    );

    expect(await redis.get(BookingService.formatSlotLockKey(doctorId, slotId))).toBe(
      newReservation.data.reservationId,
    );
  });

  it('never exposes the lock owner in public status', async () => {
    await service.reserveSlot({ doctorId, slotId }, patientA);
    const status = await service.getSlotLockStatus(doctorId, slotId);
    expect(status).toEqual({ isLocked: true, ttlSeconds: expect.any(Number) });
    expect(status).not.toHaveProperty('holder');
  });

  it('confirms pay-at-clinic only with the matching reservation and releases it safely', async () => {
    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    const appointment = await service.confirmBooking(
      {
        doctorId,
        slotId,
        reservationId: reservation.data.reservationId,
        reasonForVisit: 'Khám tổng quát',
        paymentMethod: PaymentMethod.PAY_AT_CLINIC,
      },
      patientA,
    );

    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect((await service.getSlotLockStatus(doctorId, slotId)).isLocked).toBe(false);
  });

  it('confirms booking for a dependent, sets createdBy and patientId and returns patient info', async () => {
    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    const appointment = await service.confirmBooking(
      {
        doctorId,
        slotId,
        reservationId: reservation.data.reservationId,
        reasonForVisit: 'Khám cho người thân',
        paymentMethod: PaymentMethod.PAY_AT_CLINIC,
        bookingFor: 'other',
        patientName: 'Nguyễn Thị Mẹ',
        patientPhone: '0988776655',
        patientDob: '1960-01-01',
        patientGender: 'female',
      },
      patientA,
    );

    expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    expect(queryRunner.manager!.create).toHaveBeenCalledWith(
      AppointmentEntity,
      expect.objectContaining({
        patientId: 'dependent-user-id',
        createdBy: patientA,
      }),
    );
    expect(appointment.patient?.fullName).toBe('Nguyễn Thị Mẹ');
  });

  it('keeps an online booking pending with a holding slot and active reservation', async () => {
    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    const appointment = await service.confirmBooking(
      {
        doctorId,
        slotId,
        reservationId: reservation.data.reservationId,
        reasonForVisit: 'Khám tổng quát',
        paymentMethod: PaymentMethod.VNPAY,
      },
      patientA,
    );

    expect(appointment.status).toBe(AppointmentStatus.PENDING_PAYMENT);
    expect(appointment.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(queryRunner.manager!.save).toHaveBeenCalledWith(
      DoctorScheduleEntity,
      expect.objectContaining({ status: SlotStatus.HOLDING }),
    );
    expect(queryRunner.manager!.create).toHaveBeenCalledWith(
      AppointmentEntity,
      expect.objectContaining({
        reservationId: reservation.data.reservationId,
        reservationExpiresAt: new Date(reservation.data.expiresAt),
        paymentStatus: PaymentStatus.PENDING,
      }),
    );
    expect((await service.getSlotLockStatus(doctorId, slotId)).isLocked).toBe(true);
  });

  it('rejects confirmation when the reservation expires after the initial check', async () => {
    const reservation = await service.reserveSlot({ doctorId, slotId }, patientA);
    const originalGet = redis.get.bind(redis);
    let metadataReads = 0;
    jest.spyOn(redis, 'get').mockImplementation(async (key) => {
      if (key === BookingService.formatReservationKey(reservation.data.reservationId)) {
        metadataReads += 1;
        if (metadataReads === 2) return null;
      }
      return originalGet(key);
    });

    await expect(
      service.confirmBooking(
        {
          doctorId,
          slotId,
          reservationId: reservation.data.reservationId,
          reasonForVisit: 'Boundary expiry',
          paymentMethod: PaymentMethod.VNPAY,
        },
        patientA,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.manager!.create).not.toHaveBeenCalled();
  });
});

describe('Booking mutation authorization', () => {
  let app: INestApplication;
  const service = {
    reserveSlot: jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        doctorId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        slotId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
        reservationId: '95276349-390f-4ebc-b62b-5c96f60cf899',
        expiresAt: new Date().toISOString(),
        ttlSeconds: 600,
      },
    }),
    releaseSlot: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        Reflector,
        { provide: BookingService, useValue: service },
        { provide: APP_GUARD, useClass: BookingRoleTestGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects anonymous and non-patient slot mutations', async () => {
    const body = {
      doctorId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      slotId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
    };
    await request(app.getHttpServer()).post('/api/v1/booking/reserve-slot').send(body).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/booking/reserve-slot')
      .set('x-test-role', Role.DOCTOR)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/booking/release-slot')
      .set('x-test-role', Role.ADMIN)
      .send({ ...body, reservationId: '95276349-390f-4ebc-b62b-5c96f60cf899' })
      .expect(403);
  });

  it('accepts patient mutations and rejects forged identity fields', async () => {
    const body = {
      doctorId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      slotId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
    };
    await request(app.getHttpServer())
      .post('/api/v1/booking/reserve-slot')
      .set('x-test-role', Role.PATIENT)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/booking/reserve-slot')
      .set('x-test-role', Role.PATIENT)
      .send({ ...body, userId: 'forged-user' })
      .expect(400);
  });
});
