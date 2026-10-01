import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AvailableWalkInDoctorsRequest } from '@shared/interfaces';

export class AvailableDoctorsDto implements AvailableWalkInDoctorsRequest {
  @IsOptional()
  @IsUUID('4')
  specialtyId?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  doctorName?: string;
}
