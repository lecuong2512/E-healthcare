import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  AppointmentStatus,
  CounterPaymentMethod,
  DateOfBirthPrecision,
  PaymentMethod,
  PaymentStatus,
  QueueSource,
  Role,
  SlotStatus,
  UserStatus,
  ReceptionAuditAction,
} from '@shared/enums';
import {
  AvailableWalkInDoctor,
  WalkInBookingResponse,
  WalkInPatientSelectionError,
} from '@shared/interfaces';
import { RedisService } from '../../common/redis/redis.service';
import { normalizeVietnamesePhone, vietnamesePhoneVariants } from '../../common/utils/vn-phone.util';
import { vietnamNow } from '../../common/utils/vn-time.util';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { PersonalHealthProfileEntity, UserRoleEntity } from '../../database/entities/auth.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { BookingService } from '../booking/booking.service';
import { CounterPaymentService } from './counter-payment.service';
import { AvailableDoctorsDto } from './dto/available-doctors.dto';
import { WalkInDto } from './dto/walk-in.dto';
import { QueueNumberService } from './queue-number.service';
import { QueueEventsService } from '../realtime/queue-events.service';
import { ReceptionAuditContext, ReceptionAuditService } from './reception-audit.service';

const ACTIVE_STATUSES = [
  AppointmentStatus.PENDING_PAYMENT,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_CONSULTATION,
];

function sameName(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  return normalize(left) === normalize(right);
}

function uniqueConstraint(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string; constraint?: string };
  return driverError.code === '23505' && driverError.constraint === constraint;
}

@Injectable()
export class WalkInService {
  private readonly logger = new Logger(WalkInService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly queueNumbers: QueueNumberService,
    private readonly payments: CounterPaymentService,
    private readonly queueEvents: QueueEventsService,
    private readonly audit: ReceptionAuditService,
  ) {}

  async availableDoctors(query: AvailableDoctorsDto): Promise<AvailableWalkInDoctor[]> {
    const now = vietnamNow();
    const builder = this.dataSource
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder('schedule')
      .innerJoinAndSelect('schedule.doctor', 'doctor')
      .innerJoinAndSelect('doctor.user', 'doctorUser')
      .innerJoinAndSelect('doctor.specialty', 'specialty')
      .where('schedule.date = :date', { date: now.date })
      .andWhere('schedule.start_time > :time', { time: now.time })
      .andWhere('schedule.status = :status', { status: SlotStatus.AVAILABLE })
      .orderBy('schedule.start_time', 'ASC');
    if (query.specialtyId) {
      builder.andWhere('doctor.specialty_id = :specialtyId', {
        specialtyId: query.specialtyId,
      });
    }
    if (query.doctorName) {
      builder.andWhere('doctorUser.full_name ILIKE :doctorName', {
        doctorName: `%${query.doctorName}%`,
      });
    }

    const slots = await builder.getMany();
    let holds: Array<string | null>;
    try {
      holds = await Promise.all(slots.map((slot) =>
        this.redis.get(BookingService.formatSlotLockKey(slot.doctorId, slot.id)),
      ));
    } catch {
      throw new ServiceUnavailableException('Không thể kiểm tra slot đang được giữ.');
    }

    const doctors = new Map<string, AvailableWalkInDoctor>();
    slots.forEach((slot, index) => {
      if (holds[index]) return;
      let item = doctors.get(slot.doctorId);
      if (!item) {
        item = {
          doctorId: slot.doctorId,
          doctorName: slot.doctor.user.fullName,
          specialtyName: slot.doctor.specialty.name,
          roomNumber: slot.doctor.roomNumber,
          consultationFee: Number(slot.doctor.consultationFee),
          availableSlots: [],
        };
        doctors.set(slot.doctorId, item);
      }
      item.availableSlots.push({
        scheduleId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    });
    return [...doctors.values()];
  }

  async book(
    dto: WalkInDto,
    context: ReceptionAuditContext,
    idempotencyKey: string | undefined,
  ): Promise<WalkInBookingResponse> {
    const receptionistId = context.actorId;
    if (!receptionistId) throw new UnauthorizedException();
    if (!idempotencyKey || !isUUID(idempotencyKey, '4')) {
      throw new BadRequestException('Idempotency-Key phải là UUID v4.');
    }
    if (dto.paymentMethod !== CounterPaymentMethod.CASH) {
      throw new BadRequestException('Walk-in chỉ hỗ trợ thu tiền mặt.');
    }
    if (dto.birthYear > Number(vietnamNow().date.slice(0, 4))) {
      throw new BadRequestException('Năm sinh không hợp lệ.');
    }
    const phone = normalizeVietnamesePhone(dto.phone);
    const citizenId = dto.citizenId?.trim() || null;
    const requestHash = createHash('sha256').update(JSON.stringify({
      scheduleId: dto.scheduleId,
      fullName: dto.fullName.trim().replace(/\s+/g, ' '),
      phone,
      citizenId,
      patientId: dto.patientId ?? null,
      birthYear: dto.birthYear,
      gender: dto.gender,
      reasonForVisit: dto.reasonForVisit,
      paymentMethod: dto.paymentMethod,
      amountTendered: dto.amountTendered,
    })).digest('hex');

    const existing = await this.findIdempotent(receptionistId, idempotencyKey, requestHash);
    if (existing) return existing;

    const slot = await this.dataSource.getRepository(DoctorScheduleEntity).findOneBy({
      id: dto.scheduleId,
    });
    if (!slot) throw new NotFoundException('Không tìm thấy khung khám.');
    const lockKey = BookingService.formatSlotLockKey(slot.doctorId, slot.id);
    const lockToken = randomUUID();
    let acquired: boolean;
    try {
      acquired = await this.redis.setNxEx(lockKey, lockToken, 15);
    } catch {
      throw new ServiceUnavailableException('Không thể khóa khung khám.');
    }
    if (!acquired) {
      const committed = await this.findIdempotent(receptionistId, idempotencyKey, requestHash);
      if (committed) return committed;
      throw new ConflictException('Khung khám đang được giữ bởi yêu cầu khác.');
    }

    try {
      const result = await this.dataSource.transaction('READ COMMITTED', async (manager): Promise<WalkInBookingResponse> => {
        const lockedSlot = await manager.getRepository(DoctorScheduleEntity)
          .createQueryBuilder('schedule')
          .setLock('pessimistic_write')
          .where('schedule.id = :id', { id: dto.scheduleId })
          .getOne();
        if (!lockedSlot) throw new NotFoundException('Không tìm thấy khung khám.');
        const now = vietnamNow();
        if (
          lockedSlot.date !== now.date ||
          lockedSlot.startTime <= now.time ||
          lockedSlot.status !== SlotStatus.AVAILABLE
        ) {
          throw new ConflictException('Khung khám không còn khả dụng trong ngày.');
        }

        const doctor = await manager.getRepository(DoctorEntity).findOneBy({
          id: lockedSlot.doctorId,
        });
        if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');
        const patient = await this.resolvePatient(manager, dto, phone);
        const overlapping = await manager.getRepository(AppointmentEntity)
          .createQueryBuilder('appointment')
          .innerJoin('appointment.schedule', 'otherSchedule')
          .where('appointment.patient_id = :patientId', { patientId: patient.id })
          .andWhere('appointment.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
          .andWhere('otherSchedule.date = :date', { date: now.date })
          .andWhere('otherSchedule.start_time < :endTime', { endTime: lockedSlot.endTime })
          .andWhere('otherSchedule.end_time > :startTime', { startTime: lockedSlot.startTime })
          .getOne();
        if (overlapping) {
          throw new ConflictException('Bệnh nhân đã có lịch khám trùng khung giờ.');
        }

        lockedSlot.status = SlotStatus.BOOKED;
        await manager.save(DoctorScheduleEntity, lockedSlot);
        const queueNumber = await this.queueNumbers.allocate(
          manager, lockedSlot.doctorId, now.date,
        );
        const checkedInAt = new Date();
        const appointment = await this.createAppointment(
          manager, dto, {
            patientId: patient.id,
            doctorId: lockedSlot.doctorId,
            date: now.date,
            queueNumber,
            fee: Number(doctor.consultationFee),
            checkedInAt,
            receptionistId,
            idempotencyKey,
            requestHash,
          },
        );
        const receipt = await this.payments.recordCashPayment(
          manager, appointment, context, dto.amountTendered,
        );
        await this.audit.record(
          manager, context, ReceptionAuditAction.WALK_IN_BOOKED,
          appointment.id, patient.id,
          { scheduleId: lockedSlot.id, queueNumber },
        );
        return {
          appointmentId: appointment.id,
          appointmentCode: appointment.appointmentCode,
          patientId: patient.id,
          doctorId: lockedSlot.doctorId,
          scheduleId: lockedSlot.id,
          status: AppointmentStatus.CHECKED_IN,
          paymentStatus: PaymentStatus.PAID,
          queueNumber,
          checkedInAt: checkedInAt.toISOString(),
          receipt,
        };
      });
      await this.queueEvents.statusChanged(result.appointmentId, null, 'WALK_IN');
      return result;
    } catch (error) {
      if (uniqueConstraint(error, 'idx_appointments_walk_in_idempotency')) {
        const committed = await this.findIdempotent(receptionistId, idempotencyKey, requestHash);
        if (committed) return committed;
      }
      if (
        uniqueConstraint(error, 'idx_appointments_active_schedule')
      ) {
        throw new ConflictException('Khung khám vừa được sử dụng.');
      }
      if (uniqueConstraint(error, 'uq_phr_citizen_id')) {
        throw new ConflictException('CCCD/CMND vừa được ghi vào hồ sơ khác, vui lòng tìm lại bệnh nhân.');
      }
      throw error;
    } finally {
      try {
        await this.redis.releaseLockIfOwner(lockKey, lockToken);
      } catch (error) {
        this.logger.warn(`Không thể giải phóng khóa slot ${slot.id}: ${String(error)}`);
      }
    }
  }

  private async resolvePatient(
    manager: EntityManager,
    dto: WalkInDto,
    phone: string,
  ): Promise<UserEntity> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`register:phone:${phone}`],
    );
    const users = manager.getRepository(UserEntity);
    const profiles = manager.getRepository(PersonalHealthProfileEntity);
    const citizenId = dto.citizenId?.trim();

    if (citizenId) {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`patient:citizen-id:${citizenId}`],
      );
      const profile = await profiles.findOneBy({ citizenId });
      if (profile) {
        if (dto.patientId && dto.patientId !== profile.userId) {
          throw new ConflictException('patientId không khớp hồ sơ có CCCD/CMND này.');
        }
        const patient = await users.createQueryBuilder('user')
          .setLock('pessimistic_write')
          .where('user.id = :id', { id: profile.userId })
          .getOne();
        if (!patient || !this.matchesIdentity(patient, dto)) {
          throw new ConflictException('CCCD/CMND đã có nhưng thông tin bệnh nhân không khớp.');
        }
        const currentProfile = await profiles.findOneBy({ userId: patient.id, citizenId });
        if (!currentProfile) {
          throw new ConflictException('CCCD/CMND vừa được thay đổi, vui lòng tìm lại bệnh nhân.');
        }
        await this.assertPatientRole(manager, patient.id);
        return patient;
      }
    }

    if (dto.patientId) {
      const patient = await users.createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: dto.patientId })
        .getOne();
      if (!patient || !this.matchesIdentity(patient, dto)) {
        throw new ConflictException('Hồ sơ bệnh nhân được chọn không khớp thông tin walk-in.');
      }
      await this.assertPatientRole(manager, patient.id);
      if (citizenId) {
        const profile = await profiles.findOneBy({ userId: patient.id });
        if (!profile) throw new ConflictException('Hồ sơ bệnh nhân chưa có PHR để gắn CCCD/CMND.');
        if (profile.citizenId && profile.citizenId !== citizenId) {
          throw new ConflictException('Hồ sơ đã có CCCD/CMND khác, cần xác minh thủ công.');
        }
        if (!profile.citizenId) {
          profile.citizenId = citizenId;
          await profiles.save(profile);
        }
      }
      return patient;
    }

    const matches = await users.createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.phone_number IN (:...phones)', {
        phones: vietnamesePhoneVariants(phone),
      })
      .getMany();
    const candidates: UserEntity[] = [];
    for (const patient of matches) {
      if (!this.matchesIdentity(patient, dto)) continue;
      const role = await manager.getRepository(UserRoleEntity).findOneBy({
        userId: patient.id,
        role: Role.PATIENT,
      });
      if (!role) continue;
      if (citizenId) {
        const profile = await profiles.findOneBy({ userId: patient.id });
        if (profile?.citizenId) continue;
      }
      candidates.push(patient);
    }
    if (candidates.length) {
      const selection: WalkInPatientSelectionError = {
        code: 'PATIENT_SELECTION_REQUIRED',
        message: 'Tìm thấy hồ sơ có thể khớp. Lễ tân cần xác nhận patientId trước khi đặt lịch.',
        candidates: candidates.map((patient) => ({
          patientId: patient.id,
          fullName: patient.fullName,
          gender: patient.gender,
          dateOfBirth: patient.dateOfBirth,
          dateOfBirthPrecision: patient.dateOfBirthPrecision,
        })),
      };
      throw new ConflictException(selection);
    }
    return this.createPatient(manager, dto, phone, citizenId ?? null);
  }

  private matchesIdentity(patient: UserEntity, dto: WalkInDto): boolean {
    return sameName(patient.fullName, dto.fullName) &&
      patient.gender === dto.gender &&
      Number(patient.dateOfBirth.slice(0, 4)) === dto.birthYear;
  }

  private async assertPatientRole(manager: EntityManager, userId: string): Promise<void> {
    const role = await manager.getRepository(UserRoleEntity).findOneBy({
      userId,
      role: Role.PATIENT,
    });
    if (!role) throw new ConflictException('Tài khoản không có hồ sơ bệnh nhân.');
  }

  private async createPatient(
    manager: EntityManager,
    dto: WalkInDto,
    phone: string,
    citizenId: string | null,
  ): Promise<UserEntity> {
    const users = manager.getRepository(UserEntity);
    const patient = await users.save(users.create({
      phoneNumber: phone,
      email: null,
      passwordHash: null,
      fullName: dto.fullName,
      gender: dto.gender,
      dateOfBirth: `${dto.birthYear}-01-01`,
      dateOfBirthPrecision: DateOfBirthPrecision.YEAR,
      status: UserStatus.PENDING_VERIFY,
    }));
    await manager.getRepository(UserRoleEntity).save({ userId: patient.id, role: Role.PATIENT });
    await manager.getRepository(PersonalHealthProfileEntity).save({
      userId: patient.id,
      citizenId,
    });
    return patient;
  }

  private async createAppointment(
    manager: EntityManager,
    dto: WalkInDto,
    values: {
      patientId: string;
      doctorId: string;
      date: string;
      queueNumber: number;
      fee: number;
      checkedInAt: Date;
      receptionistId: string;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<AppointmentEntity> {
    const repository = manager.getRepository(AppointmentEntity);
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = randomInt(0, 10000).toString().padStart(4, '0');
      const appointmentCode = `APT-${values.date.replaceAll('-', '').slice(2)}-${suffix}`;
      await manager.query('SAVEPOINT walk_in_code');
      try {
        const appointment = await repository.save(repository.create({
          appointmentCode,
          patientId: values.patientId,
          doctorId: values.doctorId,
          scheduleId: dto.scheduleId,
          status: AppointmentStatus.CHECKED_IN,
          reasonForVisit: dto.reasonForVisit,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: PaymentMethod.PAY_AT_CLINIC,
          totalAmount: values.fee,
          queueNumber: values.queueNumber,
          queueDate: values.date,
          queueSource: QueueSource.WALK_IN,
          checkedInAt: values.checkedInAt,
          createdBy: values.receptionistId,
          walkInIdempotencyKey: values.idempotencyKey,
          walkInRequestHash: values.requestHash,
        }));
        await manager.query('RELEASE SAVEPOINT walk_in_code');
        return appointment;
      } catch (error) {
        await manager.query('ROLLBACK TO SAVEPOINT walk_in_code');
        await manager.query('RELEASE SAVEPOINT walk_in_code');
        if (uniqueConstraint(error, 'idx_appointments_appointment_code')) continue;
        throw error;
      }
    }
    throw new ConflictException('Không thể cấp mã lịch hẹn, vui lòng thử lại.');
  }

  private async findIdempotent(
    receptionistId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<WalkInBookingResponse | null> {
    const appointment = await this.dataSource.getRepository(AppointmentEntity).findOneBy({
      createdBy: receptionistId,
      walkInIdempotencyKey: idempotencyKey,
    });
    if (!appointment) return null;
    if (appointment.walkInRequestHash !== requestHash) {
      throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu khác.');
    }
    const receipt = await this.payments.getReceipt(appointment.id);
    return {
      appointmentId: appointment.id,
      appointmentCode: appointment.appointmentCode,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      scheduleId: appointment.scheduleId,
      status: AppointmentStatus.CHECKED_IN,
      paymentStatus: PaymentStatus.PAID,
      queueNumber: appointment.queueNumber!,
      checkedInAt: appointment.checkedInAt!.toISOString(),
      receipt,
    };
  }
}
