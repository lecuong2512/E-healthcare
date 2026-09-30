import { PaymentTransactionStatus as Status } from '@shared/enums';
import { permitsClinicFallback } from '../src/modules/payment/payment-recovery.policy';

describe('clinic fallback policy', () => {
  it('allows failed, timed out and superseded attempts together', () => {
    expect(permitsClinicFallback([Status.FAILED, Status.TIMEOUT, Status.SUPERSEDED].map(status => ({ status })))).toBe(true);
  });
  it.each([Status.PENDING, Status.RECONCILIATION_REQUIRED, Status.SUCCESS, Status.LATE_SUCCESS])('blocks %s', status => {
    expect(permitsClinicFallback([{ status: Status.SUPERSEDED }, { status }])).toBe(false);
  });
});
