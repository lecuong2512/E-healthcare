import { PaymentMethod } from '@shared/enums';

export type VerifiedPaymentState =
  | 'SUCCESS'
  | 'FINAL_FAILED'
  | 'PENDING'
  | 'UNKNOWN';

export interface VerifiedPaymentResult {
  provider: PaymentMethod.VNPAY | PaymentMethod.MOMO;
  merchantTransactionId: string;
  providerTransactionId?: string;
  amountVnd: number;
  state: VerifiedPaymentState;
  responseCode: string;
  rawProviderStatus?: string;
  signatureVerified: boolean;
  sourceValidated: boolean;
  sanitizedPayload: Record<string, string | number | boolean | null>;
}
