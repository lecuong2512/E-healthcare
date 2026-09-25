import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CreateEmrAddendumRequest } from '@shared/interfaces';

export class CreateEmrAddendumDto implements CreateEmrAddendumRequest {
  @IsString({ message: 'Lý do tạo phụ lục bệnh án phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Lý do tạo phụ lục bệnh án không được để trống.' })
  @MaxLength(1000, {
    message: 'Lý do tạo phụ lục bệnh án không được vượt quá 1000 ký tự.',
  })
  reason!: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú khám lâm sàng phải là chuỗi ký tự.' })
  clinicalNotes?: string;

  @IsOptional()
  @IsString({ message: 'Lời dặn bác sĩ phải là chuỗi ký tự.' })
  doctorAdvice?: string | null;

  @IsOptional()
  @IsString({ message: 'Mã bệnh ICD-10 phụ phải là chuỗi ký tự.' })
  @MaxLength(255, {
    message: 'Danh sách mã ICD-10 phụ không vượt quá 255 ký tự.',
  })
  icd10SecondaryCodes?: string | null;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'Ngày tái khám phải đúng định dạng ngày (YYYY-MM-DD).' },
  )
  followUpDate?: string | null;
}
