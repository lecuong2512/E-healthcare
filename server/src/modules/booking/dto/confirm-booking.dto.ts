import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsUUID('all', { message: 'reservationId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'reservationId không được để trống.' })
  reservationId!: string;

  @IsString({ message: 'Lý do khám phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Lý do khám không được để trống.' })
  reasonForVisit!: string;

  @IsEnum(PaymentMethod, {
    message: 'Phương thức thanh toán không hợp lệ (VNPAY, MOMO, PAY_AT_CLINIC).',
  })
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString({ message: 'Mã voucher phải là chuỗi ký tự.' })
  voucherCode?: string;
}
