import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AppointmentStatus,
  DateOfBirthPrecision,
  Gender,
  PaymentMethod,
  PaymentStatus,
  Role,
  SlotStatus,
  UserStatus,
} from '@shared/enums';
import {
  AppointmentResponse,
  ReleaseSlotResponse,
  ReserveSlotResponse,
} from '@shared/interfaces';
import { RedisService } from '../../common/redis/redis.service';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { VoucherEntity } from '../../database/entities/voucher.entity';
import { PersonalHealthProfileEntity, UserRoleEntity } from '../../database/entities/auth.entity';
import { ConfirmBookingDto, ReleaseSlotDto, ReserveSlotDto } from './dto';
import { paymentTimeoutSeconds } from '../payment/payment-timeout';
import { isBookableStart } from './booking-slot-time';

import { WebPushService } from '../notification/services/web-push.service';

interface ReservationMetadata {
  reservationId: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  expiresAt: string;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    @Optional() private readonly webPushService?: WebPushService,
  ) {}

  static formatSlotLockKey(doctorId: string, slotId: string): string {
    return `lock:doctor:${doctorId}:slot:${slotId}`;
  }

  static formatReservationKey(reservationId: string): string {
    return `reservation:${reservationId}`;
  }

  async reserveSlot(
    dto: ReserveSlotDto,
    authenticatedUserId: string,
  ): Promise<ReserveSlotResponse> {
    if (!authenticatedUserId) {
      throw new BadRequestException('userId là bắt buộc để giữ chỗ.');
    }
    if (this.dataSource.isInitialized) {
      const slot = await this.dataSource.getRepository(DoctorScheduleEntity).findOne({
        where: { id: dto.slotId, doctorId: dto.doctorId },
      });
      if (!slot) {
        throw new NotFoundException('Không tìm thấy khung giờ khám.');
      }
      if (!isBookableStart(slot.date, slot.startTime)) {
        throw new HttpException('Khung giờ đã qua hoặc không đủ thời gian đặt trước.', HttpStatus.CONFLICT);
      }
      if (
        [SlotStatus.HOLDING, SlotStatus.BOOKED, SlotStatus.OFF].includes(slot.status)
      ) {
        throw new HttpException(
          'Khung giờ đã được giữ, đã đặt hoặc không còn khả dụng.',
          HttpStatus.CONFLICT,
        );
      }
    }

    const reservationId = randomUUID();
    const ttlSeconds = paymentTimeoutSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const lockKey = BookingService.formatSlotLockKey(dto.doctorId, dto.slotId);
    const metadataKey = BookingService.formatReservationKey(reservationId);
    const metadata: ReservationMetadata = {
      reservationId,
      patientId: authenticatedUserId,
      doctorId: dto.doctorId,
      slotId: dto.slotId,
      expiresAt,
    };
    const acquired = await this.redisService.acquireReservation(
      lockKey,
      metadataKey,
      reservationId,
      JSON.stringify(metadata),
      ttlSeconds,
    );
    if (!acquired) {
      this.logger.warn(
        `Slot contention detected for slot ${dto.slotId} of doctor ${dto.doctorId}`,
      );
      throw new HttpException(
        'Khung giờ này vừa được người khác chọn, vui lòng chọn khung giờ khác.',
        HttpStatus.CONFLICT,
      );
    }
    return {
      success: true,
      message: 'Giữ chỗ khung giờ thành công trong 10 phút.',
      data: {
        doctorId: dto.doctorId,
        slotId: dto.slotId,
        reservationId,
        expiresAt,
        ttlSeconds,
      },
    };
  }

  async releaseSlot(
    dto: ReleaseSlotDto,
    authenticatedUserId: string,
  ): Promise<ReleaseSlotResponse> {
    if (!authenticatedUserId) {
      throw new BadRequestException('userId là bắt buộc để hủy giữ chỗ.');
    }
    const reservation = await this.loadReservation(dto.reservationId);
    if (!reservation) {
      return { success: false, message: 'Reservation không tồn tại hoặc đã hết hạn.' };
    }
    this.assertReservationOwner(
      reservation,
      authenticatedUserId,
      dto.doctorId,
      dto.slotId,
    );
    const released = await this.redisService.releaseReservationIfOwner(
      BookingService.formatSlotLockKey(dto.doctorId, dto.slotId),
      BookingService.formatReservationKey(dto.reservationId),
      dto.reservationId,
    );
    return released
      ? { success: true, message: 'Giải phóng giữ chỗ thành công.' }
      : { success: false, message: 'Reservation không còn sở hữu khóa giữ chỗ.' };
  }

  async confirmBooking(
    dto: ConfirmBookingDto,
    authenticatedUserId: string,
  ): Promise<AppointmentResponse> {
    const patientId = authenticatedUserId;
    if (!patientId) {
      throw new BadRequestException('patientId là bắt buộc để chốt lịch hẹn.');
    }
    const reservation = await this.loadReservation(dto.reservationId);
    if (!reservation) {
      throw new HttpException(
        'Reservation không tồn tại hoặc đã hết hạn.',
        HttpStatus.CONFLICT,
      );
    }
    this.assertReservationOwner(
      reservation,
      patientId,
      dto.doctorId,
      dto.slotId,
    );
    const lockKey = BookingService.formatSlotLockKey(dto.doctorId, dto.slotId);
    if ((await this.redisService.get(lockKey)) !== dto.reservationId) {
      throw new HttpException(
        'Reservation không còn sở hữu khóa giữ chỗ.',
        HttpStatus.CONFLICT,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');
    try {
      const slot = await queryRunner.manager
        .getRepository(DoctorScheduleEntity)
        .createQueryBuilder('schedule')
        .setLock('pessimistic_write')
        .where('schedule.id = :slotId AND schedule.doctor_id = :doctorId', {
          slotId: dto.slotId,
          doctorId: dto.doctorId,
        })
        .getOne();
      if (!slot) throw new NotFoundException('Không tìm thấy khung giờ khám.');
      if (!isBookableStart(slot.date, slot.startTime)) {
        throw new HttpException('Khung giờ đã qua hoặc không đủ thời gian đặt trước.', HttpStatus.CONFLICT);
      }
      const currentReservation = await this.loadReservation(dto.reservationId);
      if (!currentReservation) {
        throw new HttpException('Reservation đã hết hạn.', HttpStatus.CONFLICT);
      }
      this.assertReservationOwner(
        currentReservation,
        patientId,
        dto.doctorId,
        dto.slotId,
      );
      if ((await this.redisService.get(lockKey)) !== dto.reservationId) {
        throw new HttpException(
          'Reservation không còn sở hữu khóa giữ chỗ.',
          HttpStatus.CONFLICT,
        );
      }
      if (
        [SlotStatus.HOLDING, SlotStatus.BOOKED, SlotStatus.OFF].includes(slot.status)
      ) {
        throw new HttpException(
          'Khung giờ khám đã được đặt hoặc không còn khả dụng.',
          HttpStatus.CONFLICT,
        );
      }

      const payAtClinic = dto.paymentMethod === PaymentMethod.PAY_AT_CLINIC;
      slot.status = payAtClinic ? SlotStatus.BOOKED : SlotStatus.HOLDING;
      await queryRunner.manager.save(DoctorScheduleEntity, slot);

      const doctor = await queryRunner.manager.getRepository(DoctorEntity).findOne({
        where: { id: dto.doctorId },
      });
      if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');
      let totalAmount = Number(doctor.consultationFee);
      let discountAmount = 0;
      let voucher: VoucherEntity | null = null;
      if (dto.voucherCode) {
        voucher = await queryRunner.manager
          .getRepository(VoucherEntity)
          .createQueryBuilder('voucher')
          .setLock('pessimistic_write')
          .where('voucher.code = :code AND voucher.user_id = :patientId', {
            code: dto.voucherCode.trim().toUpperCase(),
            patientId,
          })
          .getOne();
        if (!voucher || voucher.isUsed || voucher.expiresAt <= new Date()) {
          throw new BadRequestException('Voucher không hợp lệ hoặc đã hết hạn.');
        }
        discountAmount =
          Math.round(totalAmount * Number(voucher.discountPercent)) / 100;
        totalAmount = Math.max(0, totalAmount - discountAmount);
      }

      let targetPatient: UserEntity | null = null;
      let targetPatientId = authenticatedUserId;

      if (dto.bookingFor === 'other' && dto.patientName?.trim()) {
        const usersRepo = queryRunner.manager.getRepository(UserEntity);
        const patientName = dto.patientName.trim();
        const rawPhone = dto.patientPhone ? dto.patientPhone.replace(/\D/g, '') : null;

        if (rawPhone) {
          const candidates = await usersRepo.find({
            where: { phoneNumber: rawPhone },
          });
          targetPatient = candidates.find(
            (c) => c.fullName.trim().toLowerCase() === patientName.toLowerCase(),
          ) ?? null;
        }

        if (!targetPatient) {
          let contactPhone = rawPhone;
          if (!contactPhone) {
            const bookerUser = await usersRepo.findOneBy({ id: authenticatedUserId });
            contactPhone = bookerUser?.phoneNumber ?? null;
          }

          const rawGender = dto.patientGender?.toLowerCase();
          const gender = rawGender === 'female' || rawGender === Gender.FEMALE
            ? Gender.FEMALE
            : rawGender === 'other' || rawGender === Gender.OTHER
              ? Gender.OTHER
              : Gender.MALE;

          const dateOfBirth = dto.patientDob?.trim() || '1990-01-01';

          targetPatient = await usersRepo.save(
            usersRepo.create({
              fullName: patientName,
              phoneNumber: contactPhone,
              email: null,
              passwordHash: null,
              gender,
              dateOfBirth,
              dateOfBirthPrecision: DateOfBirthPrecision.FULL_DATE,
              status: UserStatus.PENDING_VERIFY,
              failedLoginAttempts: 0,
              loginLockedUntil: null,
              googleSubject: null,
            }),
          );

          await queryRunner.manager.getRepository(UserRoleEntity).save({
            userId: targetPatient.id,
            role: Role.PATIENT,
          });

          await queryRunner.manager.getRepository(PersonalHealthProfileEntity).save({
            userId: targetPatient.id,
          });
        }

        targetPatientId = targetPatient.id;
      } else {
        targetPatient = await queryRunner.manager.getRepository(UserEntity).findOneBy({
          id: authenticatedUserId,
        });
      }

      const appointment = queryRunner.manager.create(AppointmentEntity, {
        appointmentCode: this.generateAppointmentCode(),
        patientId: targetPatientId,
        createdBy: authenticatedUserId,
        doctorId: dto.doctorId,
        scheduleId: dto.slotId,
        reservationId: dto.reservationId,
        reservationExpiresAt: new Date(reservation.expiresAt),
        canonicalPaymentTransactionId: null,
        status: payAtClinic
          ? AppointmentStatus.CONFIRMED
          : AppointmentStatus.PENDING_PAYMENT,
        reasonForVisit: dto.reasonForVisit,
        paymentStatus: payAtClinic ? PaymentStatus.UNPAID : PaymentStatus.PENDING,
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
      const saved = await queryRunner.manager.save(AppointmentEntity, appointment);
      if (voucher) {
        voucher.isUsed = true;
        voucher.usedAt = new Date();
        voucher.redeemedAppointmentId = saved.id;
        await queryRunner.manager.save(VoucherEntity, voucher);
      }
      await queryRunner.commitTransaction();

      if (payAtClinic) {
        await this.redisService.releaseReservationIfOwner(
          lockKey,
          BookingService.formatReservationKey(dto.reservationId),
          dto.reservationId,
        );
        if (this.webPushService) {
          const doctorUser = await this.dataSource.getRepository(UserEntity).findOneBy({ id: doctor.userId });
          const doctorName = doctorUser?.fullName || doctor.academicTitle || 'Bác sĩ';
          this.webPushService.sendAppointmentConfirmed(
            authenticatedUserId,
            saved.appointmentCode,
            doctorName,
            slot.date,
            slot.startTime,
          ).catch((err) => this.logger.warn(`Push notification failed: ${err?.message || err}`));
        }
      }
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
        patient: targetPatient
          ? {
              id: targetPatient.id,
              fullName: targetPatient.fullName,
              phoneNumber: targetPatient.phoneNumber,
              gender: targetPatient.gender,
              dateOfBirth: targetPatient.dateOfBirth,
            }
          : undefined,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getSlotLockStatus(
    doctorId: string,
    slotId: string,
  ): Promise<{ isLocked: boolean; ttlSeconds: number }> {
    const lockKey = BookingService.formatSlotLockKey(doctorId, slotId);
    const holder = await this.redisService.get(lockKey);
    const ttl = await this.redisService.ttl(lockKey);
    return { isLocked: !!holder, ttlSeconds: ttl > 0 ? ttl : 0 };
  }

  private async loadReservation(
    reservationId: string,
  ): Promise<ReservationMetadata | null> {
    const raw = await this.redisService.get(
      BookingService.formatReservationKey(reservationId),
    );
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as ReservationMetadata;
      return value.reservationId === reservationId &&
        value.patientId &&
        value.doctorId &&
        value.slotId &&
        value.expiresAt
        ? value
        : null;
    } catch {
      return null;
    }
  }

  private assertReservationOwner(
    reservation: ReservationMetadata,
    patientId: string,
    doctorId: string,
    slotId: string,
  ): void {
    if (reservation.patientId !== patientId) {
      throw new ForbiddenException('Reservation không thuộc bệnh nhân hiện tại.');
    }
    if (reservation.doctorId !== doctorId || reservation.slotId !== slotId) {
      throw new HttpException('Reservation không khớp lịch khám.', HttpStatus.CONFLICT);
    }
    if (new Date(reservation.expiresAt).getTime() <= Date.now()) {
      throw new HttpException('Reservation đã hết hạn.', HttpStatus.CONFLICT);
    }
  }

  private generateAppointmentCode(): string {
    const now = new Date();
    const date = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    return `APT-${date}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
}
