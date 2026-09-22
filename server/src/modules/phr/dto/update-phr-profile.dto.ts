import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { Gender } from '@shared/enums';

export class UpdatePhrProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(20)
  @Matches(/^(?:$|\d{9}|\d{12})$/, { message: 'CCCD/CMND phải gồm 9 hoặc 12 chữ số.' })
  citizenId!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @MaxLength(255)
  address!: string;

  @IsString()
  @MaxLength(20)
  healthInsurance!: string;

  @IsString()
  @MaxLength(3)
  bloodType!: string;

  @IsString()
  allergies!: string;

  @IsString()
  chronicDiseases!: string;

  @IsString()
  surgeryHistory!: string;
}
