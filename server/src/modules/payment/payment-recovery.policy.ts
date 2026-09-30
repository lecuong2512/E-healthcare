import { PaymentTransactionStatus } from '@shared/enums';

/** A superseded attempt can still report late success; the finalizer refunds it. */
export function permitsClinicFallback(payments: ReadonlyArray<{ status: PaymentTransactionStatus }>): boolean {
  return payments.every(({ status }) => [PaymentTransactionStatus.FAILED,
    PaymentTransactionStatus.TIMEOUT, PaymentTransactionStatus.SUPERSEDED].includes(status));
}
