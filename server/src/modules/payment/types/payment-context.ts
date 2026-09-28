import { PaymentMethod } from '@shared/enums';

export interface PaymentContext {
  provider: PaymentMethod.VNPAY | PaymentMethod.MOMO;
  merchantTransactionId: string;
  requestId: string;
  amountVnd: number;
  clientIp: string;
  expiresAt: Date;
}
