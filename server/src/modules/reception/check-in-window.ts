import { vietnamNow } from '../../common/utils/vn-time.util';

export const CHECK_IN_EARLY_MINUTES = 60;
export const CHECK_IN_LATE_MINUTES = 15;

export type CheckInWindowStatus = 'OPEN' | 'OTHER_DAY' | 'TOO_EARLY' | 'TOO_LATE';

function secondsOfDay(time: string): number {
  const [hours, minutes, seconds = 0] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function checkInWindowStatus(
  schedule: { date: string; startTime: string; endTime: string },
  now: ReturnType<typeof vietnamNow> = vietnamNow(),
): CheckInWindowStatus {
  if (schedule.date !== now.date) return 'OTHER_DAY';
  const current = secondsOfDay(now.time);
  if (current < secondsOfDay(schedule.startTime) - CHECK_IN_EARLY_MINUTES * 60) {
    return 'TOO_EARLY';
  }
  if (current > secondsOfDay(schedule.endTime) + CHECK_IN_LATE_MINUTES * 60) {
    return 'TOO_LATE';
  }
  return 'OPEN';
}

export function checkInWindowReason(status: Exclude<CheckInWindowStatus, 'OPEN'>): string {
  switch (status) {
    case 'OTHER_DAY':
      return 'Chỉ được check-in lịch hẹn trong ngày.';
    case 'TOO_EARLY':
      return `Chỉ được check-in từ ${CHECK_IN_EARLY_MINUTES} phút trước giờ khám.`;
    case 'TOO_LATE':
      return `Đã quá thời gian check-in (${CHECK_IN_LATE_MINUTES} phút sau khi kết thúc khung khám).`;
  }
}
