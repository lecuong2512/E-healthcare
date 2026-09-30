// Schedules are stored as clinic-local date/time, never as the host's timezone.
export function bookingEarliestStart(now = new Date()): Date {
  const configured = Number(process.env.BOOKING_MIN_LEAD_MINUTES || 0);
  const minutes = Number.isFinite(configured) ? Math.min(1440, Math.max(0, configured)) : 0;
  return new Date(now.getTime() + minutes * 60_000);
}

export function isBookableStart(date: string, startTime: string, now = new Date()): boolean {
  const timestamp = new Date(`${date}T${startTime}+07:00`).getTime();
  return Number.isFinite(timestamp) && timestamp > bookingEarliestStart(now).getTime();
}

export const BOOKABLE_SCHEDULE_SQL = "(schedule.date + schedule.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' > :earliestStart";
