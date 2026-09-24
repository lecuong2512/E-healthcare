import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
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
  @ValidateIf((o) => !!o.healthInsurance)
  @Matches(/^[A-Z]{2}\s?[1-5]\s?\d{2}\s?\d{9,10}$/, {
    message: 'Mã thẻ BHYT phải đúng định dạng 15 ký tự chuẩn Việt Nam (VD: DN4010123456789).',
  })
  healthInsurance!: string;

  @IsString()
  @Matches(/^(A|B|AB|O)[+-]$/)
  bloodType!: string;

  @IsString()
  allergies!: string;

  @IsString()
  chronicDiseases!: string;

  @IsString()
  surgeryHistory!: string;
}