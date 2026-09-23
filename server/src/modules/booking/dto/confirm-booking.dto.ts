import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@shared/enums';
import { IConfirmBookingRequest } from '@shared/interfaces';

export class ConfirmBookingDto implements IConfirmBookingRequest {
  @IsUUID('all', { message: 'doctorId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'doctorId không được để trống.' })
  doctorId!: string;

  @IsUUID('all', { message: 'slotId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'slotId không được để trống.' })
  slotId!: string;

  @IsOptional()
  @IsUUID('all', { message: 'patientId phải là UUID hợp lệ.' })
  patientId?: string;

  @IsString({ message: 'Lý do khám phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Lý do khám không được để trống.' })
  reasonForVisit!: string;

  @IsEnum(PaymentMethod, {
    message: 'Phương thức thanh toán không hợp lệ (VNPAY, MOMO, PAY_AT_CLINIC).',
  })
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsNumber({}, { message: 'Tổng tiền phải là số.' })
  @Min(0, { message: 'Tổng tiền không được âm.' })
  totalAmount?: number;

  @IsOptional()
  @IsString({ message: 'Mã voucher phải là chuỗi ký tự.' })
  voucherCode?: string;
}
