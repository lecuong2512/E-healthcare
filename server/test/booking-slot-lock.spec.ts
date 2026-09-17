import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, BadRequestException, NotFoundException, INestApplication } from '@nestjs/common';
import { DataSource, Repository, QueryRunner } from 'typeorm';
import request from 'supertest';
import { BookingService } from '../src/modules/booking/booking.service';
import { BookingController } from '../src/modules/booking/booking.controller';
import { RedisService, REDIS_CLIENT } from '../src/common/redis/redis.service';
import { DoctorScheduleEntity } from '../src/database/entities/doctor-schedule.entity';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { SlotStatus, AppointmentStatus, PaymentStatus, PaymentMethod } from '@shared/enums';
import { configureApp } from '../src/configure-app';

class MockRedisClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, mode?: string, ttlSeconds?: number, flag?: string): Promise<string | null> {
    const now = Date.now();
    const existing = this.store.get(key);

    // If NX flag is passed, only set if key doesn't exist (or has expired)
    if (flag === 'NX' && existing && existing.expiresAt > now) {
      return null;
    }

    const ttl = (mode === 'EX' && ttlSeconds) ? ttlSeconds * 1000 : 600000;
    this.store.set(key, { value, expiresAt: now + ttl });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async ttl(key: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.store.delete(key);
      return -2;
    }
    return Math.ceil((entry.expiresAt - now) / 1000);
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async eval(script: string, numKeys: number, key: string, arg: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > now && entry.value === arg) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }

  clear() {
    this.store.clear();
  }
}

describe('Distributed Slot Locking (Section 5.1 & SRS-PAT-02)', () => {
  let bookingService: BookingService;
  let redisService: RedisService;
  let mockRedisClient: MockRedisClient;
  let mockDataSource: Partial<DataSource>;
  let mockSlotRepo: Partial<Repository<DoctorScheduleEntity>>;
  let mockQueryRunner: Partial<QueryRunner>;

  const doctorId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const slotId = 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e';
  const userA = 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f';
  const userB = 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a';

  beforeEach(() => {
    mockRedisClient = new MockRedisClient();
    redisService = new RedisService(mockRedisClient as any);

    mockSlotRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: slotId,
        doctorId,
        status: SlotStatus.AVAILABLE,
        date: '2026-09-20',
        startTime: '08:30:00',
        endTime: '09:00:00',
        version: 0,
      }),
    };

    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue({
              id: slotId,
              doctorId,
              status: SlotStatus.AVAILABLE,
              version: 0,
            }),
          }),
          findOne: jest.fn().mockResolvedValue({
            id: doctorId,
            consultationFee: 300000,
          }),
        }),
        save: jest.fn().mockImplementation((entityClass, entity) => {
          if (entityClass === DoctorScheduleEntity) {
            return Promise.resolve(entity);
          }
          return Promise.resolve({
            id: 'apt-uuid-12345',
            ...entity,
          });
        }),
        create: jest.fn().mockImplementation((entityClass, plain) => plain),
      } as any,
    };

    mockDataSource = {
      isInitialized: true,
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === DoctorScheduleEntity) return mockSlotRepo;
        return {};
      }),
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    bookingService = new BookingService(
      redisService,
      mockDataSource as DataSource,
    );
  });

  afterEach(() => {
    mockRedisClient.clear();
    jest.clearAllMocks();
  });

  describe('1. Khóa giữ chỗ (reserve-slot) & Tranh chấp khóa (Concurrency Contention)', () => {
    it('cho phép người dùng A giữ chỗ thành công với TTL 600s khi slot còn trống', async () => {
      const result = await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('thành công');
      expect(result.data.doctorId).toBe(doctorId);
      expect(result.data.slotId).toBe(slotId);
      expect(result.data.userId).toBe(userA);
      expect(result.data.ttlSeconds).toBe(600);

      // Verify key in Redis
      const lockKey = BookingService.formatSlotLockKey(doctorId, slotId);
      const val = await redisService.get(lockKey);
      expect(val).toBe(userA);

      const ttl = await redisService.ttl(lockKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(600);
    });

    it('từ chối người dùng B với mã lỗi HTTP 409 Conflict khi người dùng A đang giữ chỗ', async () => {
      // User A acquires lock
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      // User B tries to acquire lock on the SAME slot
      await expect(
        bookingService.reserveSlot({
          doctorId,
          slotId,
          userId: userB,
        }),
      ).rejects.toThrow(HttpException);

      try {
        await bookingService.reserveSlot({
          doctorId,
          slotId,
          userId: userB,
        });
      } catch (error: any) {
        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
        const response = error.getResponse();
        expect(response.message).toBe(
          'Khung giờ này vừa được người khác chọn, vui lòng chọn khung giờ khác.',
        );
      }
    });

    it('cho phép người dùng A gọi lại mà không bị lỗi (idempotent)', async () => {
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      const secondCall = await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      expect(secondCall.success).toBe(true);
      expect(secondCall.data.userId).toBe(userA);
    });

    it('từ chối giữ chỗ nếu slot trong CSDL đã chuyển sang BOOKED hoặc OFF', async () => {
      (mockSlotRepo.findOne as jest.Mock).mockResolvedValueOnce({
        id: slotId,
        doctorId,
        status: SlotStatus.BOOKED,
      });

      await expect(
        bookingService.reserveSlot({
          doctorId,
          slotId,
          userId: userA,
        }),
      ).rejects.toThrow(HttpException);
    });

    it('giả lập 100 requests đồng thời tranh chấp 1 slot: DUY NHẤT 1 request thành công, 99 nhận 409 Conflict', async () => {
      const requests = Array.from({ length: 100 }, (_, i) => {
        const candidateUserId = `user-${i}`;
        return bookingService
          .reserveSlot({
            doctorId,
            slotId,
            userId: candidateUserId,
          })
          .then((res) => ({ status: 201, res }))
          .catch((err) => ({
            status: err instanceof HttpException ? err.getStatus() : 500,
            err,
          }));
      });

      const results = await Promise.all(requests);
      const successful = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successful.length).toBe(1);
      expect(conflicts.length).toBe(99);
      expect((successful[0] as any).res.success).toBe(true);
    });
  });

  describe('2. Giải phóng khóa (release-slot)', () => {
    it('cho phép chính người giữ chỗ giải phóng khóa', async () => {
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      const releaseResult = await bookingService.releaseSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      expect(releaseResult.success).toBe(true);

      // Now user B can acquire the slot
      const userBResult = await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userB,
      });
      expect(userBResult.success).toBe(true);
      expect(userBResult.data.userId).toBe(userB);
    });

    it('ngăn chặn người khác giải phóng khóa không thuộc quyền sở hữu của mình', async () => {
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      // User B attempts to release User A's lock
      const releaseAttempt = await bookingService.releaseSlot({
        doctorId,
        slotId,
        userId: userB,
      });

      expect(releaseAttempt.success).toBe(false);

      // Lock is still retained by User A
      const status = await bookingService.getSlotLockStatus(doctorId, slotId);
      expect(status.isLocked).toBe(true);
      expect(status.holder).toBe(userA);
    });
  });

  describe('3. Chốt đặt khám thanh toán tại quầy (confirm-booking) với DB Transaction', () => {
    it('thực thi Transaction SELECT ... FOR UPDATE, chuyển slot sang BOOKED, tạo Appointment CONFIRMED và xóa khóa Redis', async () => {
      // User A reserves slot first
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      const confirmed = await bookingService.confirmBooking({
        doctorId,
        slotId,
        patientId: userA,
        reasonForVisit: 'Đau đầu, sốt nhẹ 2 ngày',
        paymentMethod: PaymentMethod.PAY_AT_CLINIC,
      });

      expect(confirmed.appointmentCode).toMatch(/^APT-\d{6}-\d{4}$/);
      expect(confirmed.status).toBe(AppointmentStatus.CONFIRMED);
      expect(confirmed.paymentStatus).toBe(PaymentStatus.UNPAID);
      expect(confirmed.paymentMethod).toBe(PaymentMethod.PAY_AT_CLINIC);
      expect(confirmed.totalAmount).toBe(300000);

      // Verify DB Transaction was committed
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();

      // Verify Redis lock was released after confirmation
      const status = await bookingService.getSlotLockStatus(doctorId, slotId);
      expect(status.isLocked).toBe(false);
    });

    it('từ chối chốt lịch nếu người chốt không phải người giữ khóa Redis', async () => {
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      await expect(
        bookingService.confirmBooking({
          doctorId,
          slotId,
          patientId: userB,
          reasonForVisit: 'Khám tổng quát',
          paymentMethod: PaymentMethod.PAY_AT_CLINIC,
        }),
      ).rejects.toThrow(HttpException);

      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('rollback Transaction nếu slot trong CSDL đã bị người khác chốt trước đó', async () => {
      await bookingService.reserveSlot({
        doctorId,
        slotId,
        userId: userA,
      });

      // Mock slot in DB as already BOOKED
      const repoMock = (mockQueryRunner.manager as any).getRepository(DoctorScheduleEntity);
      repoMock.createQueryBuilder().getOne.mockResolvedValueOnce({
        id: slotId,
        doctorId,
        status: SlotStatus.BOOKED,
      });

      await expect(
        bookingService.confirmBooking({
          doctorId,
          slotId,
          patientId: userA,
          reasonForVisit: 'Khám mắt',
          paymentMethod: PaymentMethod.PAY_AT_CLINIC,
        }),
      ).rejects.toThrow(HttpException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('4. Tích hợp Controller & API Endpoints qua Supertest', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [BookingController],
        providers: [
          BookingService,
          {
            provide: RedisService,
            useValue: redisService,
          },
          {
            provide: DataSource,
            useValue: mockDataSource,
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /api/v1/appointments/reserve-slot trả về 201 Created khi đặt thành công', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments/reserve-slot')
        .send({
          doctorId,
          slotId,
          userId: userA,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ttlSeconds).toBe(600);
    });

    it('POST /api/v1/appointments/reserve-slot trả về 409 Conflict khi bị trùng slot', async () => {
      // First reservation
      await request(app.getHttpServer())
        .post('/api/v1/appointments/reserve-slot')
        .send({ doctorId, slotId, userId: userA });

      // Second reservation on same slot
      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments/reserve-slot')
        .send({ doctorId, slotId, userId: userB });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        'Khung giờ này vừa được người khác chọn, vui lòng chọn khung giờ khác.',
      );
    });

    it('POST /api/v1/appointments/release-slot giải phóng thành công', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/appointments/reserve-slot')
        .send({ doctorId, slotId, userId: userA });

      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments/release-slot')
        .send({ doctorId, slotId, userId: userA });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/v1/appointments/slot-lock/:doctorId/:slotId trả về trạng thái khóa', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/appointments/reserve-slot')
        .send({ doctorId, slotId, userId: userA });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/slot-lock/${doctorId}/${slotId}`);

      expect(res.status).toBe(200);
      expect(res.body.isLocked).toBe(true);
      expect(res.body.holder).toBe(userA);
      expect(res.body.ttlSeconds).toBeGreaterThan(0);
    });
  });
});
