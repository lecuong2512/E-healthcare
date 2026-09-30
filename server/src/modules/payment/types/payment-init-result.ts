export interface PaymentInitResult {
  merchantTransactionId: string;
  providerTransactionId?: string;
  paymentUrl: string;
  expiresAt: Date;
  responseCode?: string;
  providerStatus?: string;
}
