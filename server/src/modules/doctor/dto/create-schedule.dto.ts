import { IsDateString, IsEnum, IsIn, IsInt } from 'class-validator';
import { ShiftType } from '@shared/enums';

export class CreateDoctorScheduleDto {
  @IsDateString()
  date!: string;

  @IsEnum(ShiftType) // MORNING (08:00-12:00) | AFTERNOON (13:30-17:30) — giờ cố định, lấy từ SHIFT_TIME_RANGES
  shiftType!: ShiftType;

  @IsInt()
  @IsIn([15, 30])
  slotDurationMinutes!: number;
}