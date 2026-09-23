import {
  Injectable,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../common/redis/redis.service';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { VoucherEntity } from '../../database/entities/voucher.entity';
import {
  SlotStatus,
  AppointmentStatus,
  PaymentStatus,
  PaymentMethod,
} from '@shared/enums';
import {
  ReserveSlotDto,
  ReleaseSlotDto,
  ConfirmBookingDto,
} from './dto';
import {
  ReserveSlotResponse,
  ReleaseSlotResponse,
  AppointmentResponse,
} from '@shared/interfaces';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  public static readonly LOCK_TTL_SECONDS = 600; // 10 minutes according to Section 5.1

  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Format standard Redis lock key: lock:doctor:{doctorId}:slot:{slotId}
   */
  public static formatSlotLockKey(doctorId: string, slotId: string): string {
    return `lock:doctor:${doctorId}:slot:${slotId}`;
  }

  /**
   * Reserve an appointment slot using distributed Redis locking (SETNX with TTL 600s).
   * If slot is already locked by another user, immediately returns HTTP 409 Conflict.
   */
  async reserveSlot(
    dto: ReserveSlotDto,
    authenticatedUserId?: string,
  ): Promise<ReserveSlotResponse> {
    const userId = dto.userId || authenticatedUserId;
    if (!userId) {
      throw new BadRequestException('userId là bắt buộc để giữ chỗ.');
    }

    // 1. Verify slot existence and availability in PostgreSQL (if DB initialized)
    if (this.dataSource.isInitialized) {
      const slotRepo = this.dataSource.getRepository(DoctorScheduleEntity);
      const slot = await slotRepo.findOne({
        where: { id: dto.slotId, doctorId: dto.doctorId },
      });

      if (slot) {
        if (slot.status === SlotStatus.BOOKED || slot.status === SlotStatus.OFF) {
          throw new HttpException(
            {
              statusCode: HttpStatus.CONFLICT,
              message: 'Khung giờ này đã có người đặt hoặc không còn khả dụng.',
            },
            HttpStatus.CONFLICT,
          );
        }
      }
    }

    // 2. Perform atomic Redis Distributed Lock (SETNX with EX 600s)
    const lockKey = BookingService.formatSlotLockKey(dto.doctorId, dto.slotId);
    const acquired = await this.redisService.setNxEx(
      lockKey,
      userId,
      BookingService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      // Check if current user already holds this lock (idempotent re-entry)
      const currentHolder = await this.redisService.get(lockKey);
      if (currentHolder === userId) {
        const remainingTtl = await this.redisService.ttl(lockKey);
        const ttl = remainingTtl > 0 ? remainingTtl : BookingService.LOCK_TTL_SECONDS;
        return {
          success: true,
          message: 'Bạn đã giữ chỗ khung giờ này.',
          data: {
            doctorId: dto.doctorId,
            slotId: dto.slotId,
            userId,
            expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
            ttlSeconds: ttl,
          },
        };
      }

      // Slot contention: Lock already held by another user
      this.logger.warn(
        `Slot contention detected for slot ${dto.slotId} of doctor ${dto.doctorId} by user ${userId}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message:
            'Khung giờ này vừa được người khác chọn, vui lòng chọn khung giờ khác.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const expiresAt = new Date(
      Date.now() + BookingService.LOCK_TTL_SECONDS * 1000,
    ).toISOString();

    return {
      success: true,
      message: 'Giữ chỗ khung giờ thành công trong 10 phút.',
      data: {
        doctorId: dto.doctorId,
        slotId: dto.slotId,
        userId,
        expiresAt,
        ttlSeconds: BookingService.LOCK_TTL_SECONDS,
      },
    };
  }

  /**
   * Release reserved slot.
   * Only the user who acquired the lock can release it.
   */
  async releaseSlot(
    dto: ReleaseSlotDto,
    authenticatedUserId?: string,
  ): Promise<ReleaseSlotResponse> {
    const userId = dto.userId || authenticatedUserId;
    if (!userId) {
      throw new BadRequestException('userId là bắt buộc để hủy giữ chỗ.');
    }

    const lockKey = BookingService.formatSlotLockKey(dto.doctorId, dto.slotId);
    const released = await this.redisService.releaseLockIfOwner(lockKey, userId);

    if (!released) {
      return {
        success: false,
        message: 'Khóa không tồn tại hoặc bạn không phải người giữ chỗ.',
      };
    }

    return {
      success: true,
      message: 'Giải phóng giữ chỗ thành công.',
    };
  }

  /**
   * Confirm booking with Pay-at-Clinic (or after payment).
   * Executes Database Transaction with SELECT ... FOR UPDATE on doctor_schedules,
   * updates slot to BOOKED, creates CONFIRMED Appointment, and releases Redis lock.
   */
  async confirmBooking(
    dto: ConfirmBookingDto,
    authenticatedUserId?: string,
  ): Promise<AppointmentResponse> {
    const patientId = authenticatedUserId ?? dto.patientId;
    if (!patientId) {
      throw new BadRequestException('patientId là bắt buộc để chốt lịch hẹn.');
    }

    const lockKey = BookingService.formatSlotLockKey(dto.doctorId, dto.slotId);

    // Verify Redis lock
    const currentHolder = await this.redisService.get(lockKey);
    if (currentHolder && currentHolder !== patientId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: 'Khung giờ này đang được người khác giữ chỗ.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // Pessimistic Write Lock on slot record in PostgreSQL
      const slot = await queryRunner.manager
        .getRepository(DoctorScheduleEntity)
        .createQueryBuilder('schedule')
        .setLock('pessimistic_write')
        .where('schedule.id = :slotId AND schedule.doctor_id = :doctorId', {
          slotId: dto.slotId,
          doctorId: dto.doctorId,
        })
        .getOne();

      if (!slot) {
        throw new NotFoundException('Không tìm thấy khung giờ khám.');
      }

      if (slot.status === SlotStatus.BOOKED || slot.status === SlotStatus.OFF) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            message: 'Khung giờ khám này đã được đặt hoặc không còn khả dụng.',
          },
          HttpStatus.CONFLICT,
        );
      }

      // Update slot status to BOOKED
      slot.status = SlotStatus.BOOKED;
      await queryRunner.manager.save(DoctorScheduleEntity, slot);

      // Always price from the doctor record; never trust a browser-supplied amount.
      const doctor = await queryRunner.manager
        .getRepository(DoctorEntity)
        .findOne({ where: { id: dto.doctorId } });
      if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');
      let totalAmount = Number(doctor.consultationFee);

      let discountAmount = 0;
      let voucher: VoucherEntity | null = null;
      if (dto.voucherCode) {
        voucher = await queryRunner.manager.getRepository(VoucherEntity).createQueryBuilder('voucher')
          .setLock('pessimistic_write').where('voucher.code = :code AND voucher.user_id = :patientId', { code: dto.voucherCode.trim().toUpperCase(), patientId })
          .getOne();
        if (!voucher || voucher.isUsed || voucher.expiresAt <= new Date()) throw new BadRequestException('Voucher không hợp lệ hoặc đã hết hạn.');
        discountAmount = Math.round(Number(totalAmount) * Number(voucher.discountPercent)) / 100;
        totalAmount = Math.max(0, Number(totalAmount) - discountAmount);
      }

      // Generate unique appointment code: APT-YYMMDD-XXXX
      const appointmentCode = this.generateAppointmentCode();

      const appointment = queryRunner.manager.create(AppointmentEntity, {
        appointmentCode,
        patientId,
        doctorId: dto.doctorId,
        scheduleId: dto.slotId,
        status: dto.paymentMethod === PaymentMethod.PAY_AT_CLINIC ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING_PAYMENT,
        reasonForVisit: dto.reasonForVisit,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: dto.paymentMethod,
        totalAmount,
        discountAmount,
        voucherCode: voucher?.code ?? null,
        checkedInAt: null,
        cancelledAt: null,
        cancellationReason: null,
        cancelledBy: null,
        refundAmount: 0,
        refundPercent: 0,
      });

      const saved = await queryRunner.manager.save(
        AppointmentEntity,
        appointment,
      );
      if (voucher) {
        voucher.isUsed = true; voucher.usedAt = new Date(); voucher.redeemedAppointmentId = saved.id;
        await queryRunner.manager.save(VoucherEntity, voucher);
      }

      await queryRunner.commitTransaction();

      // Release Redis distributed lock after successful DB commit
      await this.redisService.del(lockKey);

      return {
        id: saved.id,
        appointmentCode: saved.appointmentCode,
        patientId: saved.patientId,
        doctorId: saved.doctorId,
        scheduleId: saved.scheduleId,
        status: saved.status,
        reasonForVisit: saved.reasonForVisit,
        paymentStatus: saved.paymentStatus,
        paymentMethod: saved.paymentMethod,
        totalAmount: Number(saved.totalAmount),
        discountAmount: Number(saved.discountAmount),
        finalAmount: Number(saved.totalAmount),
        voucherCode: saved.voucherCode,
        checkedInAt: saved.checkedInAt,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get current lock status for a doctor's slot.
   */
  async getSlotLockStatus(
    doctorId: string,
    slotId: string,
  ): Promise<{ isLocked: boolean; holder: string | null; ttlSeconds: number }> {
    const lockKey = BookingService.formatSlotLockKey(doctorId, slotId);
    const holder = await this.redisService.get(lockKey);
    const ttl = await this.redisService.ttl(lockKey);
    return {
      isLocked: !!holder,
      holder,
      ttlSeconds: ttl > 0 ? ttl : 0,
    };
  }

  private generateAppointmentCode(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `APT-${yy}${mm}${dd}-${rand}`;
  }
}
