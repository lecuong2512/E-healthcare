import { Component, Input } from '@angular/core';

/**
 * STUB — popup đỏ cảnh báo dị ứng thuốc khi bác sĩ kê đơn (SRS-DOC-04).
 * Logic đối chiếu allergy list của bệnh nhân với thành phần thuốc trong đơn
 * thuộc task riêng của phân hệ Doctor (Consultation / EMR).
 */
@Component({
  selector: 'app-allergy-alert-modal',
  standalone: true,
  template: `
    <div class="rounded-lg border-2 border-red-500 bg-red-50 p-4 text-red-700" role="alert">
      <p class="font-semibold">⚠ Cảnh báo dị ứng thuốc</p>
      <p class="text-sm">[TODO] SRS-DOC-04 — {{ allergen }}</p>
    </div>
  `,
})
export class AllergyAlertModalComponent {
  @Input() allergen = '';
}
