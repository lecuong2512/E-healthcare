import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { PrescriptionItemInput } from '@shared/interfaces';

export class CreatePrescriptionItemDto implements PrescriptionItemInput {
  @IsString({ message: 'Tên thuốc phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên thuốc không được để trống.' })
  @MaxLength(255, { message: 'Tên thuốc không được vượt quá 255 ký tự.' })
  medicineName!: string;

  @IsOptional()
  @IsString({ message: 'Hoạt chất phải là chuỗi ký tự.' })
  @MaxLength(255, { message: 'Hoạt chất không được vượt quá 255 ký tự.' })
  activeIngredient?: string | null;

  @IsOptional()
  @IsString({ message: 'Liều sáng phải là chuỗi ký tự.' })
  @MaxLength(100, { message: 'Liều sáng không được vượt quá 100 ký tự.' })
  dosageMorning?: string | null;

  @IsOptional()
  @IsString({ message: 'Liều trưa phải là chuỗi ký tự.' })
  @MaxLength(100, { message: 'Liều trưa không được vượt quá 100 ký tự.' })
  dosageNoon?: string | null;

  @IsOptional()
  @IsString({ message: 'Liều chiều phải là chuỗi ký tự.' })
  @MaxLength(100, { message: 'Liều chiều không được vượt quá 100 ký tự.' })
  dosageAfternoon?: string | null;

  @IsOptional()
  @IsString({ message: 'Liều tối phải là chuỗi ký tự.' })
  @MaxLength(100, { message: 'Liều tối không được vượt quá 100 ký tự.' })
  dosageNight?: string | null;

  @IsNumber({}, { message: 'Tổng số lượng phải là số.' })
  @IsPositive({ message: 'Tổng số lượng phải lớn hơn 0.' })
  totalQuantity!: number;

  @IsString({ message: 'Đơn vị tính phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Đơn vị tính không được để trống.' })
  @MaxLength(50, { message: 'Đơn vị tính không được vượt quá 50 ký tự.' })
  unit!: string;

  @IsOptional()
  @IsString({ message: 'Hướng dẫn sử dụng phải là chuỗi ký tự.' })
  usageInstructions?: string | null;

  @IsOptional()
  @IsNumber({}, { message: 'Số ngày dùng thuốc phải là số.' })
  @IsPositive({ message: 'Số ngày dùng thuốc phải lớn hơn 0.' })
  durationDays?: number | null;
}

