import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrescriptionSafetyCheckRequest } from '@shared/interfaces';
import { CreatePrescriptionItemDto } from './create-prescription-item.dto';

export class PrescriptionSafetyCheckDto implements PrescriptionSafetyCheckRequest {
  @IsUUID('4', { message: 'Mã ca khám (appointmentId) phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'Mã ca khám không được để trống.' })
  appointmentId!: string;

  @IsOptional()
  @IsString({ message: 'Mã ICD-10 phải là chuỗi ký tự.' })
  icd10PrimaryCode?: string;

  @IsArray({ message: 'Danh sách thuốc phải là một mảng.' })
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items!: CreatePrescriptionItemDto[];
}
