import { bookingEarliestStart, isBookableStart } from '../src/modules/booking/booking-slot-time';

describe('clinic-local booking slot time', () => {
  const original = process.env.BOOKING_MIN_LEAD_MINUTES;
  afterEach(() => {
    if (original === undefined) delete process.env.BOOKING_MIN_LEAD_MINUTES;
    else process.env.BOOKING_MIN_LEAD_MINUTES = original;
  });
  it('excludes elapsed slots today and includes future slots independently of host timezone', () => {
    process.env.BOOKING_MIN_LEAD_MINUTES = '0';
    const now = new Date('2026-09-30T06:00:00Z');
    expect(isBookableStart('2026-09-30', '08:00:00', now)).toBe(false);
    expect(isBookableStart('2026-09-30', '13:00:00', now)).toBe(false);
    expect(isBookableStart('2026-09-30', '13:00:01', now)).toBe(true);
    expect(isBookableStart('2026-10-01', '08:00:00', now)).toBe(true);
  });
  it('enforces configurable minimum lead time', () => {
    process.env.BOOKING_MIN_LEAD_MINUTES = '15';
    const now = new Date('2026-09-30T06:00:00Z');
    expect(isBookableStart('2026-09-30', '13:10:00', now)).toBe(false);
    expect(isBookableStart('2026-09-30', '13:16:00', now)).toBe(true);
    expect(bookingEarliestStart(now).toISOString()).toBe('2026-09-30T06:15:00.000Z');
  });
});
