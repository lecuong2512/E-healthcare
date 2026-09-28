import { PaymentTransactionEntity } from '../../../database/entities/payment-trans.entity';
import { PaymentContext } from '../types/payment-context';
import { PaymentInitResult } from '../types/payment-init-result';
import { VerifiedPaymentResult } from '../types/verified-payment-result';

export interface PaymentProvider {
  initiate(context: PaymentContext): Promise<PaymentInitResult>;
  verifyCallback(payload: unknown): Promise<VerifiedPaymentResult>;
  queryStatus(transaction: PaymentTransactionEntity): Promise<VerifiedPaymentResult>;
}
