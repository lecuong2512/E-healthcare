import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type ShiftId = 'MORNING' | 'AFTERNOON' | 'EVENING';
type ViewMode = 'week' | 'month';
type ScheduleSlot = {
  id: string;
  date: string;
  shift: ShiftId;
  startTime: string;
  endTime: string;
  duration: 15 | 30;
  roomNumber: string;
  maxPatients: number;
  bookedPatients: number;
};

const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const SHIFT_INFO: Record<ShiftId, { label: string; start: number; end: number }> = {
  MORNING: { label: 'Ca sáng', start: 8 * 60, end: 12 * 60 },
  AFTERNOON: { label: 'Ca chiều', start: 13 * 60 + 30, end: 17 * 60 + 30 },
  EVENING: { label: 'Ca tối', start: 18 * 60, end: 21 * 60 },
};

@Component({
  selector: 'app-schedule-config-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedule-config.page.html',
})
export class ScheduleConfigPage {
  readonly shifts: ShiftId[] = ['MORNING', 'AFTERNOON', 'EVENING'];
  readonly weekdays = WEEKDAYS;
  readonly durations: Array<15 | 30> = [15, 30];
  readonly roomOptions = ['204', '205', '301', '302'];

  viewMode: ViewMode = 'week';
  anchor = new Date();
  showRegistrationForm = false;
  registrationMode: 'weekday' | 'date' = 'weekday';
  selectedWeekday = 0;
  selectedDate = '';
  selectedShift: ShiftId = 'MORNING';
  slotDuration: 15 | 30 = 15;
  maxPatients = 8;
  roomNumber = '204';
  formMessage = '';
  editingSlot: ScheduleSlot | null = null;
  editDate = '';
  editShift: ShiftId = 'MORNING';
  editDuration: 15 | 30 = 15;
  editMaxPatients = 8;
  editRoomNumber = '';
  private idSequence = 1;
  scheduleSlots: ScheduleSlot[] = [];

  constructor() {
    this.seedMockSchedule();
  }

  get weekDates(): Date[] {
    const monday = this.startOfWeek(this.anchor);
    return Array.from({ length: 7 }, (_, index) => this.addDays(monday, index));
  }

  get monthDates(): Array<Date | null> {
    const first = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: mondayOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
  }

  get heading(): string {
    if (this.viewMode === 'month') return this.anchor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    const end = this.addDays(this.anchor, 6);
    return `${this.formatDate(this.anchor)} – ${this.formatDate(end)}`;
  }

  get targetDate(): string {
    const date = this.registrationMode === 'date'
      ? this.parseDate(this.selectedDate)
      : this.addDays(this.nextMonday(), this.selectedWeekday);
    return this.dateKey(date);
  }

  get todayKey(): string { return this.dateKey(new Date()); }

  get previewSlots(): Array<{ startTime: string; endTime: string }> {
    const shift = SHIFT_INFO[this.selectedShift];
    const result: Array<{ startTime: string; endTime: string }> = [];
    const capacity = Math.floor((shift.end - shift.start) / this.slotDuration);
    const count = Math.min(Math.max(1, Number(this.maxPatients) || 1), capacity);
    for (let index = 0; index < count; index++) {
      const start = shift.start + index * this.slotDuration;
      result.push({ startTime: this.formatTime(start), endTime: this.formatTime(start + this.slotDuration) });
    }
    return result;
  }

  get registrationDeadline(): Date {
    const monday = this.nextMonday();
    const friday = this.addDays(monday, -3);
    friday.setHours(17, 0, 0, 0);
    return friday;
  }

  get isAfterDeadline(): boolean {
    const now = new Date();
    const target = this.parseDate(this.targetDate);
    return this.isDateInNextWeek(target) && now >= this.registrationDeadline;
  }

  get isTargetDateInPast(): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.parseDate(this.targetDate) < today;
  }

  get deadlineWarning(): string {
    return `Đăng ký lịch cho tuần sau trước 17:00 Thứ Sáu (${this.formatDate(this.registrationDeadline)}).`;
  }

  get maxAllowedPatients(): number {
    const shift = SHIFT_INFO[this.selectedShift];
    return Math.floor((shift.end - shift.start) / this.slotDuration);
  }

  get editMaxAllowedPatients(): number {
    const shift = SHIFT_INFO[this.editShift];
    return Math.floor((shift.end - shift.start) / this.editDuration);
  }

  shiftLabel(shift: ShiftId): string { return SHIFT_INFO[shift].label; }
  weekdayLabel(date: Date): string { return WEEKDAYS[(date.getDay() + 6) % 7]; }
  dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  formatDate(date: Date): string { return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  formatTime(totalMinutes: number): string { return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`; }

  getSlots(date: Date, shift?: ShiftId): ScheduleSlot[] {
    const key = this.dateKey(date);
    return this.scheduleSlots.filter((slot) => slot.date === key && (!shift || slot.shift === shift));
  }

  getShiftSummary(date: Date, shift: ShiftId): string {
    const slots = this.getSlots(date, shift);
    if (!slots.length) return 'Chưa đăng ký';
    const booked = slots.reduce((total, slot) => total + slot.bookedPatients, 0);
    const max = slots.reduce((total, slot) => total + slot.maxPatients, 0);
    return `${booked}/${max} lượt đã đặt`;
  }

  isShiftLocked(date: Date, shift: ShiftId): boolean {
    return this.getSlots(date, shift).some((slot) => slot.bookedPatients > 0);
  }

  getShiftSlots(date: Date, shift: ShiftId): ScheduleSlot[] { return this.getSlots(date, shift); }

  openRegistration(): void {
    this.formMessage = '';
    this.selectedWeekday = 0;
    this.selectedDate = this.dateKey(this.addDays(this.nextMonday(), 0));
    this.showRegistrationForm = true;
  }

  registerShift(): void {
    this.formMessage = '';
    if (this.isTargetDateInPast) {
      this.formMessage = 'Không thể đăng ký ca làm việc trong quá khứ.';
      return;
    }
    if (this.isAfterDeadline) {
      this.formMessage = 'Đã quá hạn đăng ký lịch cho tuần sau.';
      return;
    }
    const date = this.targetDate;
    if (this.scheduleSlots.some((slot) => slot.date === date && slot.shift === this.selectedShift)) {
      this.formMessage = 'Ngày và ca này đã có lịch. Vui lòng chọn ca khác hoặc ngày khác.';
      return;
    }
    const slots = this.previewSlots.map((time) => ({
      id: `mock-${this.idSequence++}`,
      date,
      shift: this.selectedShift,
      ...time,
      duration: this.slotDuration,
      roomNumber: this.roomNumber,
      maxPatients: 1,
      bookedPatients: 0,
    } satisfies ScheduleSlot));
    this.scheduleSlots = [...this.scheduleSlots, ...slots];
    this.formMessage = `Đã đăng ký ${this.shiftLabel(this.selectedShift).toLowerCase()} ngày ${this.formatDate(this.parseDate(date))}: ${slots.length} khung giờ, tối đa ${slots.length} lượt khám, buồng ${this.roomNumber}.`;
    this.showRegistrationForm = false;
  }

  openEdit(slot: ScheduleSlot): void {
    if (this.isShiftLocked(this.parseDate(slot.date), slot.shift)) return;
    this.editingSlot = slot;
    this.editDate = slot.date;
    this.editShift = slot.shift;
    this.editDuration = slot.duration;
    this.editMaxPatients = this.getSlots(this.parseDate(slot.date), slot.shift).length;
    this.editRoomNumber = slot.roomNumber;
  }

  saveEdit(): void {
    if (!this.editingSlot) return;
    const original = this.editingSlot;
    if (this.isShiftLocked(this.parseDate(original.date), original.shift)) return;
    if (this.scheduleSlots.some((slot) => slot.date === this.editDate && slot.shift === this.editShift && slot.id !== original.id && !(slot.date === original.date && slot.shift === original.shift))) {
      this.formMessage = 'Ngày và ca mới đã có lịch. Vui lòng chọn ca khác.';
      return;
    }
    const previousKey = original.date;
    const previousShift = original.shift;
    this.scheduleSlots = this.scheduleSlots.filter((slot) => slot.date !== previousKey || slot.shift !== previousShift);
    const shift = SHIFT_INFO[this.editShift];
    const capacity = Math.floor((shift.end - shift.start) / this.editDuration);
    const count = Math.min(Math.max(1, Number(this.editMaxPatients) || 1), capacity);
    const replacement = Array.from({ length: count }, (_, index): ScheduleSlot => ({
      id: `mock-${this.idSequence++}`,
      date: this.editDate,
      shift: this.editShift,
      startTime: this.formatTime(shift.start + index * this.editDuration),
      endTime: this.formatTime(shift.start + (index + 1) * this.editDuration),
      duration: this.editDuration,
      roomNumber: this.editRoomNumber,
      maxPatients: 1,
      bookedPatients: 0,
    }));
    this.scheduleSlots = [...this.scheduleSlots, ...replacement];
    this.formMessage = `Đã cập nhật ${this.shiftLabel(this.editShift).toLowerCase()} ngày ${this.formatDate(this.parseDate(this.editDate))}: ${count} slot, buồng ${this.editRoomNumber}.`;
    this.editingSlot = null;
  }

  cancelShift(date: Date, shift: ShiftId): void {
    if (this.isShiftLocked(date, shift)) return;
    const key = this.dateKey(date);
    this.scheduleSlots = this.scheduleSlots.filter((slot) => slot.date !== key || slot.shift !== shift);
    this.formMessage = `Đã hủy ${this.shiftLabel(shift).toLowerCase()} ngày ${this.formatDate(date)}.`;
  }

  movePeriod(offset: number): void {
    this.anchor = this.viewMode === 'week'
      ? this.addDays(this.anchor, offset * 7)
      : new Date(this.anchor.getFullYear(), this.anchor.getMonth() + offset, 1);
  }

  setView(mode: ViewMode): void { this.viewMode = mode; }
  goToCurrentWeek(): void { this.anchor = new Date(); }
  monthCellDate(value: Date | null): string { return value ? String(value.getDate()) : ''; }
  parseDate(value: string): Date { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }

  private seedMockSchedule(): void {
    const monday = this.startOfWeek(new Date());
    const samples: Array<{ day: number; shift: ShiftId; duration: 15 | 30; booked: number }> = [
      { day: 0, shift: 'MORNING', duration: 30, booked: 2 },
      { day: 1, shift: 'AFTERNOON', duration: 30, booked: 0 },
      { day: 3, shift: 'MORNING', duration: 15, booked: 1 },
      { day: 4, shift: 'AFTERNOON', duration: 30, booked: 0 },
      { day: 5, shift: 'EVENING', duration: 30, booked: 0 },
    ];
    this.scheduleSlots = samples.flatMap(({ day, shift, duration, booked }) => {
      const start = SHIFT_INFO[shift].start;
      const date = this.dateKey(this.addDays(monday, day));
      const count = Math.floor((SHIFT_INFO[shift].end - start) / duration);
      return Array.from({ length: count }, (_, index) => ({
        id: `seed-${this.idSequence++}`,
        date,
        shift,
        startTime: this.formatTime(start + index * duration),
        endTime: this.formatTime(start + (index + 1) * duration),
        duration,
        roomNumber: day === 3 ? '205' : '204',
        maxPatients: 1,
        bookedPatients: index < booked ? 1 : 0,
      }));
    });
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
    return result;
  }

  private nextMonday(): Date { return this.addDays(this.startOfWeek(new Date()), 7); }
  private addDays(date: Date, days: number): Date { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
  private isDateInNextWeek(date: Date): boolean { const monday = this.nextMonday(); const nextSunday = this.addDays(monday, 6); return date >= monday && date <= nextSunday; }
}
