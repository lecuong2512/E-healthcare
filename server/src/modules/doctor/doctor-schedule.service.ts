import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, QueryFailedError } from "typeorm";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import {
  SCHEDULE_DEADLINE_DAY,
  SCHEDULE_DEADLINE_HOUR,
} from "@shared/constants/shift.constants";
import { DoctorEntity } from "../../database/entities/doctor.entity";
import { DoctorScheduleEntity } from "../../database/entities/doctor-schedule.entity";
import { SlotStatus, SHIFT_TIME_RANGES } from "@shared/enums";
import { CreateDoctorScheduleDto } from "./dto/create-schedule.dto";
import { ScheduleRangeDto } from "./dto/schedule-range.dto";
import { UpdateDoctorScheduleDto } from "./dto/update-schedule.dto";
import { DoctorCacheService } from "./doctor-cache.service";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const OVERLAP_ERROR_CODE = "23P01";

export interface DoctorScheduleResult {
  doctorId: string;
  roomNumber: string;
  slots: DoctorScheduleEntity[];
}

@Injectable()
export class DoctorScheduleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: DoctorCacheService,
  ) {}

  async createSchedule(
    doctorId: string,
    dto: CreateDoctorScheduleDto,
  ): Promise<DoctorScheduleResult> {
    this.assertRegistrationDeadline(dto.date);
    const doctor = await this.findDoctor(doctorId);
    const { startTime, endTime } = SHIFT_TIME_RANGES[dto.shiftType];
    const slots = this.generateSlots(
      startTime,
      endTime,
      dto.slotDurationMinutes,
    );

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        await this.assertNoOverlap(
          doctorId,
          dto.date,
          startTime,
          endTime,
          manager,
        );
        const entities = slots.map((slot) =>
          manager.create(DoctorScheduleEntity, {
            doctorId,
            date: dto.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: SlotStatus.AVAILABLE,
          }),
        );
        return manager.save(entities);
      });
      await this.cache.invalidateDoctorData(doctorId);
      return { doctorId, roomNumber: doctor.roomNumber, slots: saved };
    } catch (error) {
      this.rethrowOverlap(error);
    }
  }

  async getSchedules(
    doctorId: string,
    range: ScheduleRangeDto,
  ): Promise<DoctorScheduleResult> {
    const doctor = await this.findDoctor(doctorId);
    if (range.from && range.to && range.from > range.to) {
      throw new BadRequestException(
        "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
      );
    }

    const query = this.dataSource
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder("schedule")
      .where("schedule.doctor_id = :doctorId", { doctorId })
      .orderBy("schedule.date", "ASC")
      .addOrderBy("schedule.start_time", "ASC");
    if (range.from)
      query.andWhere("schedule.date >= :from", { from: range.from });
    if (range.to) query.andWhere("schedule.date <= :to", { to: range.to });

    return {
      doctorId,
      roomNumber: doctor.roomNumber,
      slots: await query.getMany(),
    };
  }

  async updateSchedule(
    doctorId: string,
    scheduleId: string,
    dto: UpdateDoctorScheduleDto,
  ): Promise<DoctorScheduleEntity> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DoctorScheduleEntity);
      const schedule = await repository.findOneBy({ id: scheduleId, doctorId });
      if (!schedule)
        throw new NotFoundException("Không tìm thấy khung giờ khám.");
      this.assertAvailable(schedule);

      const date = dto.date ?? schedule.date;
      const startTime = this.normalizeTime(dto.startTime ?? schedule.startTime);
      const endTime = this.normalizeTime(dto.endTime ?? schedule.endTime);
      this.assertTimeRange(startTime, endTime);
      this.assertRegistrationDeadline(date);
      await this.assertNoOverlap(
        doctorId,
        date,
        startTime,
        endTime,
        manager,
        scheduleId,
      );

      try {
        const result = await repository
          .createQueryBuilder()
          .update(DoctorScheduleEntity)
          .set({
            date,
            startTime,
            endTime,
            version: () => "version + 1",
          })
          .where("id = :scheduleId", { scheduleId })
          .andWhere("doctor_id = :doctorId", { doctorId })
          .andWhere("status = :status", { status: SlotStatus.AVAILABLE })
          .andWhere("version = :version", { version: dto.version })
          .execute();
        if (result.affected !== 1) {
          throw new ConflictException(
            "Khung giờ đã được đặt hoặc vừa được thay đổi bởi yêu cầu khác.",
          );
        }
      } catch (error) {
        this.rethrowOverlap(error);
      }

      return (await repository.findOneBy({ id: scheduleId }))!;
    });
    await this.cache.invalidateDoctorData(doctorId);
    return updated;
  }

  async deleteSchedule(doctorId: string, scheduleId: string): Promise<void> {
    const repository = this.dataSource.getRepository(DoctorScheduleEntity);
    const result = await repository
      .createQueryBuilder()
      .delete()
      .from(DoctorScheduleEntity)
      .where("id = :scheduleId", { scheduleId })
      .andWhere("doctor_id = :doctorId", { doctorId })
      .andWhere("status = :status", { status: SlotStatus.AVAILABLE })
      .execute();
    if (result.affected !== 1) {
      const exists = await repository.existsBy({ id: scheduleId, doctorId });
      if (!exists)
        throw new NotFoundException("Không tìm thấy khung giờ khám.");
      throw new ConflictException(
        "Không thể hủy khung giờ đang được giữ chỗ hoặc đã có bệnh nhân đặt.",
      );
    }
    await this.cache.invalidateDoctorData(doctorId);
  }

  private async findDoctor(doctorId: string): Promise<DoctorEntity> {
    const doctor = await this.dataSource
      .getRepository(DoctorEntity)
      .findOneBy({ id: doctorId });
    if (!doctor) throw new NotFoundException("Không tìm thấy bác sĩ.");
    return doctor;
  }

  private generateSlots(
    shiftStart: string,
    shiftEnd: string,
    durationMinutes: number,
  ): Array<{ startTime: string; endTime: string }> {
    const slots: Array<{ startTime: string; endTime: string }> = [];
    let cursor = this.toMinutes(shiftStart);
    const end = this.toMinutes(shiftEnd);
    while (cursor + durationMinutes <= end) {
      slots.push({
        startTime: this.toTimeString(cursor),
        endTime: this.toTimeString(cursor + durationMinutes),
      });
      cursor += durationMinutes;
    }
    return slots;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private toTimeString(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, "0");
    const minutes = (totalMinutes % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:00`;
  }

  private normalizeTime(time: string): string {
    return time.length === 5 ? `${time}:00` : time;
  }

  private assertTimeRange(startTime: string, endTime: string): void {
    if (this.toMinutes(endTime) <= this.toMinutes(startTime)) {
      throw new BadRequestException("Giờ kết thúc phải sau giờ bắt đầu.");
    }
  }

  private assertRegistrationDeadline(date: string): void {
    const now = dayjs().tz(TIME_ZONE);
    const targetDate = dayjs.tz(date, TIME_ZONE);
    if (targetDate.isBefore(now.startOf("day"))) {
      throw new BadRequestException("Không thể khai báo lịch trong quá khứ.");
    }

    const startOfNextWeek = now.add(1, "week").startOf("isoWeek");
    const endOfNextWeek = startOfNextWeek.endOf("isoWeek");
    const isNextWeek =
      !targetDate.isBefore(startOfNextWeek) &&
      !targetDate.isAfter(endOfNextWeek);
    if (!isNextWeek) return;

    const deadline = now
      .startOf("isoWeek")
      .isoWeekday(SCHEDULE_DEADLINE_DAY)
      .hour(SCHEDULE_DEADLINE_HOUR)
      .minute(0)
      .second(0)
      .millisecond(0);
    if (!now.isBefore(deadline)) {
      throw new BadRequestException(
        `Đã quá hạn đăng ký lịch cho tuần sau (trước ${SCHEDULE_DEADLINE_HOUR}:00 Thứ Sáu).`,
      );
    }
  }

  private assertAvailable(schedule: DoctorScheduleEntity): void {
    if (schedule.status !== SlotStatus.AVAILABLE) {
      throw new ConflictException(
        "Không thể sửa khung giờ đang được giữ chỗ hoặc đã có bệnh nhân đặt.",
      );
    }
  }

  private async assertNoOverlap(
    doctorId: string,
    date: string,
    startTime: string,
    endTime: string,
    manager: EntityManager,
    excludedId?: string,
  ): Promise<void> {
    const query = manager
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder("schedule")
      .where("schedule.doctor_id = :doctorId", { doctorId })
      .andWhere("schedule.date = :date", { date })
      .andWhere(
        "schedule.start_time < :endTime AND schedule.end_time > :startTime",
        { startTime, endTime },
      );
    if (excludedId)
      query.andWhere("schedule.id <> :excludedId", { excludedId });
    if ((await query.getCount()) > 0) {
      throw new ConflictException(
        "Khung giờ bị trùng hoặc chồng giờ với lịch đã khai báo.",
      );
    }
  }

  private rethrowOverlap(error: unknown): never {
    if (error instanceof ConflictException) throw error;
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === OVERLAP_ERROR_CODE
    ) {
      throw new ConflictException(
        "Khung giờ bị trùng hoặc chồng giờ với lịch đã khai báo.",
      );
    }
    throw error;
  }
}
