import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMedicalRecordRequest } from '@shared/interfaces';
import { VitalSignsDto } from './create-vital-signs.dto';
import { CreatePrescriptionItemDto } from './create-prescription-item.dto';

export class CreateMedicalRecordDto implements CreateMedicalRecordRequest {
  @IsUUID('4', { message: 'Mã ca khám (appointmentId) phải là định dạng UUID hợp lệ.' })
  @IsNotEmpty({ message: 'Mã ca khám không được để trống.' })
  appointmentId!: string;

  @ValidateNested()
  @Type(() => VitalSignsDto)
  @IsNotEmpty({ message: 'Chỉ số sinh tồn (vitalSigns) là bắt buộc.' })
  vitalSigns!: VitalSignsDto;

  @IsString({ message: 'Ghi chú khám lâm sàng phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Ghi chú khám lâm sàng không được để trống.' })
  clinicalNotes!: string;

  @IsString({ message: 'Mã bệnh ICD-10 chính phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mã bệnh ICD-10 chính không được để trống.' })
  @MaxLength(10, { message: 'Mã ICD-10 không được vượt quá 10 ký tự.' })
  icd10PrimaryCode!: string;

  @IsOptional()
  @IsString({ message: 'Mã bệnh ICD-10 phụ phải là chuỗi ký tự.' })
  @MaxLength(255, { message: 'Danh sách mã ICD-10 phụ không vượt quá 255 ký tự.' })
  icd10SecondaryCodes?: string | null;

  @IsOptional()
  @IsString({ message: 'Lời dặn bác sĩ phải là chuỗi ký tự.' })
  doctorAdvice?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày tái khám phải đúng định dạng ngày (YYYY-MM-DD).' })
  followUpDate?: string | null;

  @IsOptional()
  @IsArray({ message: 'Danh sách đơn thuốc phải là một mảng.' })
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  prescriptionItems?: CreatePrescriptionItemDto[];
}

