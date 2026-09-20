import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import { Gender } from '@shared/enums';

export class UpdatePhrProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
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