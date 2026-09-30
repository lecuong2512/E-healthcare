import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ShiftType, SlotStatus } from '@shared/enums';
import {
  CreateDoctorSchedulePayload,
  DoctorScheduleResult,
  DoctorScheduleService,
  DoctorScheduleSlot,
} from '../../../../core/services/doctor-schedule.service';

export type ShiftId = 'MORNING' | 'AFTERNOON';
export type ViewMode = 'week' | 'month';
export type ScheduleSlot = {
  id: string;
  date: string;
  shift: ShiftId;
  startTime: string;
  endTime: string;
  duration: 15 | 30;
  roomNumber: string;
  maxPatients: number;
  bookedPatients: number;
  status?: SlotStatus;
};

const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const SHIFT_INFO: Record<ShiftId, { label: string; start: number; end: number }> = {
  MORNING: { label: 'Ca sáng', start: 8 * 60, end: 12 * 60 },
  AFTERNOON: { label: 'Ca chiều', start: 13 * 60 + 30, end: 17 * 60 + 30 },
};

@Component({
  selector: 'app-schedule-config-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedule-config.page.html',
})
export class ScheduleConfigPage implements OnInit {
  private readonly scheduleService = inject(DoctorScheduleService);

  readonly shifts: ShiftId[] = ['MORNING', 'AFTERNOON'];
  readonly weekdays = WEEKDAYS;
  readonly durations: Array<15 | 30> = [15, 30];
  roomOptions = ['204', '205', '301', '302'];

  viewMode: ViewMode = 'week';
  anchor = new Date();
  isLoading = false;
  showRegistrationForm = false;
  registrationMode: 'weekday' | 'date' = 'weekday';
  selectedWeekday = 0;
  selectedDate = '';
  selectedShift: ShiftId = 'MORNING';
  slotDuration: 15 | 30 = 15;
  maxPatients = 16;
  roomNumber = '204';
  formMessage = '';
  editingSlot: ScheduleSlot | null = null;
  editDate = '';
  editShift: ShiftId = 'MORNING';
  editDuration: 15 | 30 = 15;
  editMaxPatients = 8;
  editRoomNumber = '';
  scheduleSlots: ScheduleSlot[] = [];

  ngOnInit(): void {
    this.loadSchedules();
  }

  loadSchedules(): void {
    let from: string;
    let to: string;
    if (this.viewMode === 'week') {
      const dates = this.weekDates;
      from = this.dateKey(dates[0]);
      to = this.dateKey(dates[6]);
    } else {
      const year = this.anchor.getFullYear();
      const month = this.anchor.getMonth();
      from = this.dateKey(new Date(year, month, 1));
      to = this.dateKey(new Date(year, month + 1, 0));
    }

    this.isLoading = true;
    this.scheduleService.getMySchedules(from, to).subscribe({
      next: (res: DoctorScheduleResult) => {
        this.isLoading = false;
        if (res.roomNumber) {
          this.roomNumber = res.roomNumber;
          if (!this.roomOptions.includes(res.roomNumber)) {
            this.roomOptions.unshift(res.roomNumber);
          }
        }
        this.scheduleSlots = (res.slots || []).map((slot) =>
          this.mapSlotEntityToModel(slot, res.roomNumber),
        );
      },
      error: (err) => {
        this.isLoading = false;
        this.formMessage = err?.error?.message || 'Không thể tải danh sách ca khám.';
      },
    });
  }

  get weekDates(): Date[] {
    const monday = this.startOfWeek(this.anchor);
    return Array.from({ length: 7 }, (_, index) => this.addDays(monday, index));
  }

  get monthDates(): Array<Date | null> {
    const first = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: mondayOffset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
    ];
  }

  get heading(): string {
    if (this.viewMode === 'month') {
      return this.anchor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    }
    const end = this.addDays(this.anchor, 6);
    return `${this.formatDate(this.anchor)} – ${this.formatDate(end)}`;
  }

  get targetDate(): string {
    const date =
      this.registrationMode === 'date'
        ? this.parseDate(this.selectedDate)
        : this.addDays(this.nextMonday(), this.selectedWeekday);
    return this.dateKey(date);
  }

  get todayKey(): string {
    return this.dateKey(new Date());
  }

  get previewSlots(): Array<{ startTime: string; endTime: string }> {
    const shift = SHIFT_INFO[this.selectedShift];
    if (!shift) return [];
    const result: Array<{ startTime: string; endTime: string }> = [];
    const capacity = Math.floor((shift.end - shift.start) / this.slotDuration);
    const count = Math.min(Math.max(1, Number(this.maxPatients) || 1), capacity);
    for (let index = 0; index < count; index++) {
      const start = shift.start + index * this.slotDuration;
      result.push({
        startTime: this.formatTime(start),
        endTime: this.formatTime(start + this.slotDuration),
      });
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
    if (!shift) return 0;
    return Math.floor((shift.end - shift.start) / this.slotDuration);
  }

  get editMaxAllowedPatients(): number {
    const shift = SHIFT_INFO[this.editShift];
    if (!shift) return 0;
    return Math.floor((shift.end - shift.start) / this.editDuration);
  }

  shiftLabel(shift: ShiftId): string {
    return SHIFT_INFO[shift]?.label ?? shift;
  }

  weekdayLabel(date: Date): string {
    return WEEKDAYS[(date.getDay() + 6) % 7];
  }

  dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  formatTime(totalMinutes: number): string {
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }

  getSlots(date: Date, shift?: ShiftId): ScheduleSlot[] {
    const key = this.dateKey(date);
    return this.scheduleSlots.filter(
      (slot) => slot.date === key && (!shift || slot.shift === shift),
    );
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

  getShiftSlots(date: Date, shift: ShiftId): ScheduleSlot[] {
    return this.getSlots(date, shift);
  }

  openRegistration(): void {
    this.formMessage = '';
    this.selectedWeekday = 0;
    this.selectedDate = this.dateKey(this.addDays(this.nextMonday(), 0));
    this.selectedShift = 'MORNING';
    this.slotDuration = 15;
    this.maxPatients = this.maxAllowedPatients;
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
    if (
      this.scheduleSlots.some(
        (slot) => slot.date === date && slot.shift === this.selectedShift,
      )
    ) {
      this.formMessage = 'Ngày và ca này đã có lịch. Vui lòng chọn ca khác hoặc ngày khác.';
      return;
    }

    const payload: CreateDoctorSchedulePayload = {
      date,
      shiftType: this.selectedShift as ShiftType,
      slotDurationMinutes: this.slotDuration,
    };

    this.isLoading = true;
    this.scheduleService.createSchedule(payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.formMessage = `Đã đăng ký ${this.shiftLabel(this.selectedShift).toLowerCase()} ngày ${this.formatDate(this.parseDate(date))}: ${res.slots.length} khung giờ, tối đa ${res.slots.length} lượt khám, buồng ${res.roomNumber || this.roomNumber}.`;
        this.showRegistrationForm = false;
        this.loadSchedules();
      },
      error: (err) => {
        this.isLoading = false;
        this.formMessage = err?.error?.message || 'Đăng ký ca làm việc thất bại.';
      },
    });
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
    const originalDate = this.parseDate(original.date);
    const originalShift = original.shift;
    if (this.isShiftLocked(originalDate, originalShift)) return;

    if (
      this.scheduleSlots.some(
        (slot) =>
          slot.date === this.editDate &&
          slot.shift === this.editShift &&
          slot.id !== original.id &&
          !(slot.date === original.date && slot.shift === original.shift),
      )
    ) {
      this.formMessage = 'Ngày và ca mới đã có lịch. Vui lòng chọn ca khác.';
      return;
    }

    const oldSlots = this.getSlots(originalDate, originalShift);
    const deleteObservables = oldSlots.map((slot) =>
      this.scheduleService.deleteSchedule(slot.id),
    );

    const payload: CreateDoctorSchedulePayload = {
      date: this.editDate,
      shiftType: this.editShift as ShiftType,
      slotDurationMinutes: this.editDuration,
    };

    this.isLoading = true;
    forkJoin(deleteObservables.length ? deleteObservables : [of(null)])
      .pipe(switchMap(() => this.scheduleService.createSchedule(payload)))
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          this.formMessage = `Đã cập nhật ${this.shiftLabel(this.editShift).toLowerCase()} ngày ${this.formatDate(this.parseDate(this.editDate))}: ${res.slots.length} slot, buồng ${res.roomNumber || this.editRoomNumber}.`;
          this.editingSlot = null;
          this.loadSchedules();
        },
        error: (err) => {
          this.isLoading = false;
          this.formMessage = err?.error?.message || 'Cập nhật ca làm việc thất bại.';
          this.loadSchedules();
        },
      });
  }

  cancelShift(date: Date, shift: ShiftId): void {
    if (this.isShiftLocked(date, shift)) return;
    const slots = this.getSlots(date, shift);
    if (!slots.length) return;

    this.isLoading = true;
    const deleteObservables = slots.map((slot) =>
      this.scheduleService.deleteSchedule(slot.id),
    );
    forkJoin(deleteObservables).subscribe({
      next: () => {
        this.isLoading = false;
        this.formMessage = `Đã hủy ${this.shiftLabel(shift).toLowerCase()} ngày ${this.formatDate(date)}.`;
        this.loadSchedules();
      },
      error: (err) => {
        this.isLoading = false;
        this.formMessage = err?.error?.message || 'Hủy ca trực thất bại.';
        this.loadSchedules();
      },
    });
  }

  movePeriod(offset: number): void {
    this.anchor =
      this.viewMode === 'week'
        ? this.addDays(this.anchor, offset * 7)
        : new Date(this.anchor.getFullYear(), this.anchor.getMonth() + offset, 1);
    this.loadSchedules();
  }

  setView(mode: ViewMode): void {
    this.viewMode = mode;
    this.loadSchedules();
  }

  goToCurrentWeek(): void {
    this.anchor = new Date();
    this.loadSchedules();
  }

  monthCellDate(value: Date | null): string {
    return value ? String(value.getDate()) : '';
  }

  parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private mapSlotEntityToModel(
    slot: DoctorScheduleSlot,
    defaultRoom?: string,
  ): ScheduleSlot {
    const shift = this.getShiftFromTime(slot.startTime);
    const startMins = this.toMinutes(slot.startTime);
    const endMins = this.toMinutes(slot.endTime);
    const duration = (endMins - startMins === 30 ? 30 : 15) as 15 | 30;
    const isBooked =
      slot.status === SlotStatus.BOOKED || slot.status === SlotStatus.HOLDING;

    return {
      id: slot.id,
      date: slot.date,
      shift,
      startTime: slot.startTime.length > 5 ? slot.startTime.slice(0, 5) : slot.startTime,
      endTime: slot.endTime.length > 5 ? slot.endTime.slice(0, 5) : slot.endTime,
      duration,
      roomNumber: defaultRoom || this.roomNumber || '204',
      maxPatients: 1,
      bookedPatients: isBooked ? 1 : 0,
      status: slot.status,
    };
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  private getShiftFromTime(startTime: string): ShiftId {
    const mins = this.toMinutes(startTime);
    return mins < 13 * 60 ? 'MORNING' : 'AFTERNOON';
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
    return result;
  }

  private nextMonday(): Date {
    return this.addDays(this.startOfWeek(new Date()), 7);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private isDateInNextWeek(date: Date): boolean {
    const monday = this.nextMonday();
    const nextSunday = this.addDays(monday, 6);
    return date >= monday && date <= nextSunday;
  }
}
