import { Component } from '@angular/core';

/**
 * STUB — khung trang, thuộc phạm vi task nghiệp vụ riêng (không nằm trong
 * 5 yêu cầu của task Base Architecture). Tạo sẵn để app.routes.ts / feature
 * routes có thể lazy-load và build được ngay từ nhánh develop.
 */
@Component({
  selector: 'app-consultation-page',
  standalone: true,
  template: `<div class="p-6 text-slate-500">[TODO] Buồng khám EMR — SRS-DOC-03/04</div>`,
})
export class ConsultationPage {}
