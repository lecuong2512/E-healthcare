import { PaymentTransactionStatus } from '@shared/enums';

/** Pending attempts must be superseded atomically; late success is refunded. */
export function permitsClinicFallback(payments: ReadonlyArray<{ status: PaymentTransactionStatus }>): boolean {
  return payments.every(({ status }) => [PaymentTransactionStatus.PENDING, PaymentTransactionStatus.FAILED,
    PaymentTransactionStatus.TIMEOUT, PaymentTransactionStatus.SUPERSEDED].includes(status));
}
