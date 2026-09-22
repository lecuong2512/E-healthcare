const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET = '+07:00';
const DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function formatVietnamDateTimeInput(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')}T${value(
    'hour',
  )}:${value('minute')}`;
}

export function vietnamDateTimeToUtcIso(value: string): string | null {
  if (!DATE_TIME_LOCAL_PATTERN.test(value)) {
    return null;
  }

  const instant = new Date(`${value}:00${VIETNAM_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function createDefaultVietnamRange(now = new Date()): {
  fromLocal: string;
  toLocal: string;
} {
  const toLocal = formatVietnamDateTimeInput(now);
  return {
    fromLocal: `${toLocal.slice(0, 10)}T00:00`,
    toLocal,
  };
}
