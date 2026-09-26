import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CounterPaymentMethod, Gender } from '@shared/enums';
import { WalkInBookingRequest } from '@shared/interfaces';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const trimOptional = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class WalkInDto implements WalkInBookingRequest {
  @IsUUID('4')
  scheduleId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  fullName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(32)
  phone!: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @Length(1, 20)
  @Matches(/^(?:\d{9}|\d{12})$/, { message: 'CCCD/CMND phải gồm 9 hoặc 12 chữ số.' })
  citizenId?: string;

  @IsOptional()
  @IsUUID('4')
  patientId?: string;

  @IsInt()
  @Min(1900)
  birthYear!: number;

  @IsEnum(Gender)
  gender!: Gender;

  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  reasonForVisit!: string;

  @IsEnum(CounterPaymentMethod)
  paymentMethod!: CounterPaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  amountTendered!: number;
}
