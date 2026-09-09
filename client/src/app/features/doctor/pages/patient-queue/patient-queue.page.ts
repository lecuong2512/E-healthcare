import { Component } from '@angular/core';

/**
 * STUB — khung trang, thuộc phạm vi task nghiệp vụ riêng (không nằm trong
 * 5 yêu cầu của task Base Architecture). Tạo sẵn để app.routes.ts / feature
 * routes có thể lazy-load và build được ngay từ nhánh develop.
 */
@Component({
  selector: 'app-patient-queue-page',
  standalone: true,
  template: `<div class="p-6 text-slate-500">[TODO] Hàng đợi khám — SRS-DOC-02</div>`,
})
export class PatientQueuePage {}
