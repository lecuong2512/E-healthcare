import { IsIn } from 'class-validator';
import { PaymentMethod } from '@shared/enums';
import { InitiatePaymentRequest } from '@shared/interfaces';

export class InitiatePaymentDto implements InitiatePaymentRequest {
  @IsIn([PaymentMethod.VNPAY, PaymentMethod.MOMO], {
    message: 'Provider phải là VNPAY hoặc MOMO.',
  })
  provider!: PaymentMethod.VNPAY | PaymentMethod.MOMO;
}
