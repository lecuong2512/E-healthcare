import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

type CellState = 'available' | 'booked' | 'blocked' | 'break';
interface CellConfig { bg: string; text: string; label: string; }

const CELL: Record<CellState, CellConfig> = {
  available: { bg: '#DCFCE7', text: '#15803D', label: 'Còn trống' },
  booked: { bg: '#E0F2FE', text: '#0284C7', label: 'Đã đặt' },
  blocked: { bg: '#FEE2E2', text: '#B91C1C', label: 'Đã khóa' },
  break: { bg: '#F1F5F9', text: '#94A3B8', label: 'Ngoài ca' },
};

const API_BASE = '/api/v1';

@Component({ selector: 'app-schedule-config-page', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './schedule-config.page.html' })
export class ScheduleConfigPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly cellLegend = [ { key: 'available', config: CELL.available }, { key: 'booked', config: CELL.booked }, { key: 'blocked', config: CELL.blocked }, { key: 'break', config: CELL.break } ];
  readonly hours = this.buildHours();
  doctorId = '';
  roomNumber = '';
  weekOffset = 0;
  scheduleSlots: any[] = [];
  private mockScheduleSlots: any[] = [];
  private mockInitialized = false;
  isMockMode = false;
  isLoading = false;
  showRegistrationForm = false;
  selectedDay = 0;
  selectedShift: 'MORNING' | 'AFTERNOON' = 'MORNING';
  slotDuration = 30;
  formMessage = '';
  errorMessage = '';
  editingSlot: any = null;
  editDate = '';
  editStartTime = '';
  editEndTime = '';

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.doctorId = params.get('doctorId') || '';
      if (this.doctorId) this.loadSchedule();
      else this.loadSchedule();
    });
  }

  get days(): string[] {
    return this.weekDates().map((date, index) => `${['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'][index]} (${date.slice(8, 10)}/${date.slice(5, 7)})`);
  }

  get registrationDays(): string[] {
    return this.weekDates(this.weekOffset + 1).map((date, index) => `${['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'][index]} (${date.slice(8, 10)}/${date.slice(5, 7)})`);
  }

  get weekLabel(): string {
    const dates = this.weekDates();
    return `${dates[0]} — ${dates[6]}`;
  }

  get registrationDate(): string { return this.weekDates(this.weekOffset + 1)[this.selectedDay]; }

  get previewSlots(): { startTime: string; endTime: string }[] {
    const start = this.selectedShift === 'MORNING' ? 8 * 60 : 13 * 60 + 30;
    const end = this.selectedShift === 'MORNING' ? 12 * 60 : 17 * 60 + 30;
    const slots: { startTime: string; endTime: string }[] = [];
    for (let time = start; time + this.slotDuration <= end; time += this.slotDuration) {
      slots.push({ startTime: this.formatTime(time), endTime: this.formatTime(time + this.slotDuration) });
    }
    return slots;
  }

  get registrationDeadline(): Date {
    const monday = this.localDate(this.weekDates(this.weekOffset + 1)[0]);
    const deadline = new Date(monday);
    deadline.setDate(deadline.getDate() - 3);
    deadline.setHours(17, 0, 0, 0);
    return deadline;
  }

  get isPastDeadline(): boolean { return new Date() > this.registrationDeadline; }

  getCell(dayIdx: number, hour: string): CellConfig {
    const slot = this.getSlot(dayIdx, hour);
    if (!slot) return CELL.break;
    if (slot.status === 'BOOKED' || slot.status === 'HOLDING') return CELL.booked;
    if (slot.status === 'OFF') return CELL.blocked;
    return CELL.available;
  }

  getSlot(dayIdx: number, hour: string): any | null {
    const date = this.weekDates()[dayIdx];
    return this.scheduleSlots.find((slot) => slot.date === date && String(slot.startTime).slice(0, 5) === hour) || null;
  }

  isWithinShift(hour: string): boolean {
    const minutes = this.toMinutes(hour);
    return (minutes >= 480 && minutes < 720) || (minutes >= 810 && minutes < 1050);
  }

  getShiftSlots(dayIdx: number, shift: 'MORNING' | 'AFTERNOON'): any[] {
    const date = this.weekDates()[dayIdx];
    const start = shift === 'MORNING' ? 480 : 810;
    const end = shift === 'MORNING' ? 720 : 1050;
    return this.scheduleSlots.filter((slot) => {
      const minutes = this.toMinutes(String(slot.startTime).slice(0, 5));
      return slot.date === date && minutes >= start && minutes < end;
    });
  }

  getShiftCapacity(dayIdx: number, shift: 'MORNING' | 'AFTERNOON'): number {
    return this.getShiftSlots(dayIdx, shift).length;
  }

  isShiftBooked(dayIdx: number, shift: 'MORNING' | 'AFTERNOON'): boolean {
    return this.getShiftSlots(dayIdx, shift).some((slot) => slot.status === 'BOOKED' || slot.status === 'HOLDING');
  }

  loadSchedule() {
    if (!this.doctorId) {
      this.isMockMode = true;
      this.errorMessage = '';
      if (!this.mockInitialized) {
        this.mockScheduleSlots = this.createMockSchedule();
        this.mockInitialized = true;
      }
      const dates = this.weekDates();
      this.scheduleSlots = this.mockScheduleSlots.filter((slot) => slot.date >= dates[0] && slot.date <= dates[6]);
      this.roomNumber = '204';
      return;
    }
    this.isMockMode = false;
    const dates = this.weekDates();
    const params = new HttpParams().set('from', dates[0]).set('to', dates[6]);
    this.isLoading = true;
    this.errorMessage = '';
    this.http.get<any>(`${API_BASE}/doctors/${this.doctorId}/schedules`, { params }).subscribe({
      next: (result) => {
        this.scheduleSlots = result?.slots || [];
        this.roomNumber = result?.roomNumber || '';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải lịch trực. Vui lòng thử lại.';
        this.isLoading = false;
      },
    });
  }

  changeWeek(offset: number) { this.weekOffset += offset; this.loadSchedule(); }

  registerShift() {
    this.formMessage = '';
    if (this.isPastDeadline) { this.formMessage = 'Đã quá hạn đăng ký tuần sau (17:00 Thứ Sáu, giờ Việt Nam).'; return; }
    if (this.isMockMode) {
      const existingTimes = new Set(this.mockScheduleSlots.filter((slot) => slot.date === this.registrationDate).map((slot) => slot.startTime.slice(0, 5)));
      const collision = this.previewSlots.some((slot) => existingTimes.has(slot.startTime));
      if (collision) { this.formMessage = 'Ca mẫu đã có slot trong khung giờ này. Hãy chọn ngày hoặc ca khác.'; return; }
      const created = this.previewSlots.map((slot, index) => ({ id: `mock-${this.registrationDate}-${slot.startTime}`, doctorId: 'mock-doctor', date: this.registrationDate, startTime: `${slot.startTime}:00`, endTime: `${slot.endTime}:00`, status: 'AVAILABLE', version: 1 + index }));
      this.mockScheduleSlots.push(...created);
      this.formMessage = `Đã thêm ${created.length} slot mẫu vào tuần ${this.registrationDate}.`;
      this.showRegistrationForm = false;
      this.weekOffset += 1;
      this.loadSchedule();
      return;
    }
    const payload = { date: this.registrationDate, shiftType: this.selectedShift, slotDurationMinutes: this.slotDuration };
    this.http.post<any>(`${API_BASE}/doctors/${this.doctorId}/schedules`, payload).subscribe({
      next: (result) => {
        this.scheduleSlots = [...this.scheduleSlots, ...(result?.slots || [])];
        this.roomNumber = result?.roomNumber || this.roomNumber;
        this.formMessage = `Đã đăng ký ${result?.slots?.length || this.previewSlots.length} slot. Giới hạn số bệnh nhân bằng số slot của ca.`;
        this.showRegistrationForm = false;
        this.weekOffset += 1;
        this.loadSchedule();
      },
      error: (error) => { this.formMessage = error?.error?.message || 'Đăng ký ca trực thất bại.'; },
    });
  }

  openEdit(slot: any) {
    if (slot.status !== 'AVAILABLE') return;
    this.editingSlot = slot;
    this.editDate = slot.date;
    this.editStartTime = String(slot.startTime).slice(0, 5);
    this.editEndTime = String(slot.endTime).slice(0, 5);
    this.formMessage = '';
  }

  saveEdit() {
    if (!this.editingSlot || this.editingSlot.status !== 'AVAILABLE') return;
    if (this.isPastDeadline) { this.formMessage = 'Đã quá hạn chỉnh sửa lịch tuần tiếp theo.'; return; }
    const slot = this.editingSlot;
    if (this.isMockMode) {
      const collision = this.mockScheduleSlots.some((item) => item.id !== slot.id && item.date === this.editDate && item.startTime.slice(0, 5) === this.editStartTime);
      if (collision) { this.formMessage = 'Khung giờ này đã có slot khác.'; return; }
      Object.assign(slot, { date: this.editDate, startTime: `${this.editStartTime}:00`, endTime: `${this.editEndTime}:00`, version: slot.version + 1 });
      this.editingSlot = null;
      this.loadSchedule();
      return;
    }
    this.http.patch<any>(`${API_BASE}/doctors/${this.doctorId}/schedules/${slot.id}`, { date: this.editDate, startTime: this.editStartTime, endTime: this.editEndTime, version: slot.version }).subscribe({
      next: () => { this.editingSlot = null; this.loadSchedule(); },
      error: (error) => { this.formMessage = error?.error?.message || 'Không thể cập nhật slot.'; },
    });
  }

  cancelSlot(slot: any) {
    if (!slot || slot.status !== 'AVAILABLE') return;
    if (!window.confirm('Hủy slot trực này?')) return;
    if (this.isMockMode) {
      this.mockScheduleSlots = this.mockScheduleSlots.filter((item) => item.id !== slot.id);
      this.loadSchedule();
      return;
    }
    this.http.delete(`${API_BASE}/doctors/${this.doctorId}/schedules/${slot.id}`).subscribe({
      next: () => this.loadSchedule(),
      error: (error) => { this.errorMessage = error?.error?.message || 'Không thể hủy slot.'; },
    });
  }

  private weekDates(offset = this.weekOffset): string[] {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
  }

  private createMockSchedule(): any[] {
    const monday = this.weekDates(0);
    const demoShifts: { day: number; shift: 'MORNING' | 'AFTERNOON'; duration: number; booked: number[] }[] = [
      { day: 1, shift: 'MORNING', duration: 30, booked: [0, 1] },
      { day: 2, shift: 'AFTERNOON', duration: 30, booked: [] },
      { day: 4, shift: 'MORNING', duration: 15, booked: [2] },
      { day: 5, shift: 'AFTERNOON', duration: 30, booked: [] },
    ];
    return demoShifts.flatMap(({ day, shift, duration, booked }) => {
      const start = shift === 'MORNING' ? 480 : 810;
      const end = shift === 'MORNING' ? 720 : 1050;
      const slots: any[] = [];
      for (let time = start, index = 0; time + duration <= end; time += duration, index++) {
        const startTime = this.formatTime(time);
        const endTime = this.formatTime(time + duration);
        slots.push({ id: `mock-${monday[day]}-${startTime}`, doctorId: 'mock-doctor', date: monday[day], startTime: `${startTime}:00`, endTime: `${endTime}:00`, status: booked.includes(index) ? 'BOOKED' : 'AVAILABLE', version: 1 });
      }
      return slots;
    });
  }

  private buildHours(): string[] {
    const result: string[] = [];
    for (let time = 480; time < 720; time += 15) result.push(this.formatTime(time));
    for (let time = 810; time < 1050; time += 15) result.push(this.formatTime(time));
    return result;
  }

  private localDate(value: string): Date { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }
  private toMinutes(time: string): number { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; }
  private formatTime(totalMinutes: number): string { return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`; }
}
