import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { SlotStatus, SHIFT_TIME_RANGES } from '@shared/enums';
import { CreateDoctorScheduleDto } from './dto/create-schedule.dto';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TZ = 'Asia/Ho_Chi_Minh';

@Injectable()
export class DoctorScheduleService {
  constructor(private readonly dataSource: DataSource) {}

  async createSchedule(
    doctorId: string,
    dto: CreateDoctorScheduleDto,
  ): Promise<DoctorScheduleEntity[]> {
    this.assertRegistrationDeadline(dto.date);

    const { startTime, endTime } = SHIFT_TIME_RANGES[dto.shiftType];
    const slots = this.generateSlots(startTime, endTime, dto.slotDurationMinutes);

    return this.dataSource.transaction(async (manager) => {
      const created: DoctorScheduleEntity[] = [];
      for (const slot of slots) {
        await this.assertNoOverlap(doctorId, dto.date, slot.startTime, slot.endTime, manager);
        const entity = manager.create(DoctorScheduleEntity, {
          doctorId,
          date: dto.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: SlotStatus.AVAILABLE,
        });
        created.push(await manager.save(entity));
      }
      return created;
    });
  }

  private generateSlots(shiftStart: string, shiftEnd: string, durationMinutes: number) {
    const slots: { startTime: string; endTime: string }[] = [];
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
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private toTimeString(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}:00`;
  }

  private assertRegistrationDeadline(dateStr: string): void {
    const targetDate = dayjs.tz(dateStr, TZ);
    const now = dayjs().tz(TZ);

    const startOfNextWeek = now.add(1, 'week').startOf('isoWeek');
    const endOfNextWeek = startOfNextWeek.endOf('isoWeek');
    const isNextWeek =
      (targetDate.isAfter(startOfNextWeek) || targetDate.isSame(startOfNextWeek)) &&
      (targetDate.isBefore(endOfNextWeek) || targetDate.isSame(endOfNextWeek));

    if (!isNextWeek) return;

    const deadline = now.startOf('isoWeek').add(4, 'day').hour(17).minute(0).second(0);
    if (now.isAfter(deadline)) {
      throw new BadRequestException('Đã quá hạn đăng ký lịch cho tuần sau (trước 17:00 Thứ Sáu)');
    }
  }

  private async assertNoOverlap(
    doctorId: string,
    date: string,
    startTime: string,
    endTime: string,
    manager: EntityManager,
  ): Promise<void> {
    const overlapCount = await manager
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder('ds')
      .where('ds.doctor_id = :doctorId', { doctorId })
      .andWhere('ds.date = :date', { date })
      .andWhere('ds.start_time < :endTime AND ds.end_time > :startTime', { startTime, endTime })
      .getCount();

    if (overlapCount > 0) {
      throw new BadRequestException('Slot bị trùng hoặc chồng giờ với ca đã khai báo');
    }
  }
}