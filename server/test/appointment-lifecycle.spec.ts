import { AppointmentLifecycleService } from '../src/modules/appointment/appointment-lifecycle.service';

describe('AppointmentLifecycleService patientRefundPercent', () => {
  const now = new Date('2026-09-23T00:00:00.000Z');
  it.each([[24, 100], [2, 70], [1.99, 0]])('returns %i%% for cancellation %f hours before visit', (hours, expected) => {
    expect(AppointmentLifecycleService.patientRefundPercent(new Date(now.getTime() + hours * 3600000), now)).toBe(expected);
  });

  it('expires online payment exactly after 10 minutes', () => {
    const createdAt = new Date(now.getTime() - 10 * 60 * 1000);
    expect(AppointmentLifecycleService.isPaymentExpired(createdAt, now)).toBe(true);
    expect(AppointmentLifecycleService.isPaymentExpired(new Date(createdAt.getTime() + 1), now)).toBe(false);
  });
});
