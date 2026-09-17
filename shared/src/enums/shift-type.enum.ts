export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
}

export const SHIFT_TIME_RANGES: Record<ShiftType, { startTime: string; endTime: string }> = {
  [ShiftType.MORNING]: { startTime: '08:00:00', endTime: '12:00:00' },
  [ShiftType.AFTERNOON]: { startTime: '13:30:00', endTime: '17:30:00' },
};