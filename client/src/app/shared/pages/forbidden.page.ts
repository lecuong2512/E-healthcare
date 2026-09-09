import { Component } from '@angular/core';

@Component({
  selector: 'app-forbidden-page',
  standalone: true,
  template: `<div class="p-6 text-center text-slate-500">403 — Bạn không có quyền truy cập trang này.</div>`,
})
export class ForbiddenPage {}
