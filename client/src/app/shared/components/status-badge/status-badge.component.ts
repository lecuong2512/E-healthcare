import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

export type SlotStatus = 'available' | 'held' | 'booked';

/**
 * Phân màu trạng thái slot: Xanh (trống) / Vàng (giữ chỗ) / Xám (đã đặt).
 * Dùng trong lịch làm việc bác sĩ (SRS-DOC-01) và booking stepper (SRS-PAT-02).
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [NgClass],
  template: `
    <span
      [ngClass]="{
        'bg-emerald-100 text-emerald-700': status === 'available',
        'bg-amber-100 text-amber-700': status === 'held',
        'bg-slate-200 text-slate-600': status === 'booked'
      }"
      class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    >
      {{ label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() status: SlotStatus = 'available';

  get label(): string {
    const map: Record<SlotStatus, string> = {
      available: 'Trống',
      held: 'Đang giữ chỗ',
      booked: 'Đã đặt',
    };
    return map[this.status];
  }
}
