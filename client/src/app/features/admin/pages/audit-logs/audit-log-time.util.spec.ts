import {
  createDefaultVietnamRange,
  formatVietnamDateTimeInput,
  vietnamDateTimeToUtcIso,
} from './audit-log-time.util';

describe('audit log time utilities', () => {
  it('converts a Vietnam local value to the correct UTC instant', () => {
    expect(vietnamDateTimeToUtcIso('2026-09-22T08:30')).toBe(
      '2026-09-22T01:30:00.000Z',
    );
  });

  it('rejects malformed or impossible datetime values', () => {
    expect(vietnamDateTimeToUtcIso('not-a-date')).toBeNull();
    expect(vietnamDateTimeToUtcIso('2026-13-40T99:99')).toBeNull();
  });

  it('formats values explicitly in Asia/Ho_Chi_Minh', () => {
    const instant = new Date('2026-09-22T01:30:00.000Z');

    expect(formatVietnamDateTimeInput(instant)).toBe('2026-09-22T08:30');
    expect(createDefaultVietnamRange(instant)).toEqual({
      fromLocal: '2026-09-22T00:00',
      toLocal: '2026-09-22T08:30',
    });
  });
});
