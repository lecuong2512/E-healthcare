import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
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
