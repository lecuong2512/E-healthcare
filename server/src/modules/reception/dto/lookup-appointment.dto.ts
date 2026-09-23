import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { LookupAppointmentRequest } from '@shared/interfaces';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class LookupAppointmentDto implements LookupAppointmentRequest {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^APT-\d{6}-\d{4}$/i, { message: 'Mã lịch hẹn không hợp lệ.' })
  code?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
