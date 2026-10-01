export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
}

export const SHIFT_TIME_RANGES: Record<ShiftType, { startTime: string; endTime: string }> = {
  [ShiftType.MORNING]: { startTime: '08:00:00', endTime: '12:00:00' },
  [ShiftType.AFTERNOON]: { startTime: '13:30:00', endTime: '17:30:00' },
  [ShiftType.EVENING]: { startTime: '18:00:00', endTime: '21:00:00' },
};