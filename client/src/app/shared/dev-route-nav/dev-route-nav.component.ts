import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Role } from '@shared/enums';
import { TokenStoreService } from 'src/app/core/services/token-store.service';
import { environment } from 'src/environments/environment';

/**
 * DEV ONLY — thanh test route nổi cố định, chỉ hiện khi !environment.production.
 * Đặt ở app.component.ts (không phải trong login.page.ts) nên KHÔNG biến mất
 * khi chuyển trang — tiện bấm qua lại nhiều route liên tục để test router/guard.
 *
 * Dùng @if theo role hiện tại (tokenStore.userRole()) để chỉ hiện đúng 1 nhóm
 * link tương ứng, tránh liệt kê cả 4 nhóm cùng lúc gây rối mắt.
 *
 * FIX (review 2026-09): role giờ dùng Role enum từ @shared/enums thay vì chuỗi
 * gõ tay, khớp với fix ở app.routes.ts / auth.service.ts / login.page.ts.
 */
@Component({
  selector: 'app-dev-route-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (!isProd) {
      <div
        class="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-dashed border-amber-400 bg-amber-50 p-3 text-xs"
      >
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="font-semibold text-amber-700"
            >⚠ DEV ROUTE NAV — role hiện tại:</span
          >
          <span class="rounded bg-amber-200 px-2 py-0.5 font-mono">{{
            currentRole() ?? 'chưa đăng nhập'
          }}</span>

          <button
            type="button"
            class="ml-auto rounded bg-slate-200 px-2 py-1"
            (click)="devLoginAs(Role.PATIENT)"
          >
            Bệnh nhân
          </button>
          <button
            type="button"
            class="rounded bg-slate-200 px-2 py-1"
            (click)="devLoginAs(Role.DOCTOR)"
          >
            Bác sĩ
          </button>
          <button
            type="button"
            class="rounded bg-slate-200 px-2 py-1"
            (click)="devLoginAs(Role.RECEPTIONIST)"
          >
            Lễ tân
          </button>
          <button
            type="button"
            class="rounded bg-slate-200 px-2 py-1"
            (click)="devLoginAs(Role.ADMIN)"
          >
            Admin
          </button>
          <button
            type="button"
            class="rounded bg-red-200 px-2 py-1"
            (click)="clear()"
          >
            Đăng xuất
          </button>
        </div>

        <div class="flex flex-wrap gap-3">
          <h3>Patient</h3>
          <a routerLink="/patient" class="text-sky-700 underline">/patient</a>
          <a routerLink="/patient/doctor-search" class="text-sky-700 underline"
            >doctor-search</a
          >
          <a routerLink="/patient/booking" class="text-sky-700 underline"
            >booking</a
          >
          <a routerLink="/patient/history" class="text-sky-700 underline"
            >history</a
          >
          <a routerLink="/patient/profile" class="text-sky-700 underline"
            >profile</a
          >
        </div>

        <div class="flex flex-wrap gap-3">
          <h3>Doctor</h3>
          <a routerLink="/doctor" class="text-sky-700 underline">/doctor</a>
          <a routerLink="/doctor/schedule" class="text-sky-700 underline"
            >schedule</a
          >
          <a routerLink="/doctor/queue" class="text-sky-700 underline">queue</a>
          <a
            routerLink="/doctor/consultation/123"
            class="text-sky-700 underline"
            >consultation/123</a
          >
        </div>

        <div class="flex flex-wrap gap-3">
          <h3>Receptionist</h3>
          <a routerLink="/receptionist" class="text-sky-700 underline"
            >/receptionist</a
          >
          <a routerLink="/receptionist/checkin" class="text-sky-700 underline"
            >checkin</a
          >
          <a routerLink="/receptionist/walkin" class="text-sky-700 underline"
            >walkin</a
          >
          <a
            routerLink="/receptionist/queue-board"
            class="text-sky-700 underline"
            >queue-board</a
          >
        </div>

        <div class="flex flex-wrap gap-3">
          <h3>Admin</h3>
          <a routerLink="/admin" class="text-sky-700 underline">/admin</a>
          <a routerLink="/admin/dashboard" class="text-sky-700 underline"
            >dashboard</a
          >
          <a routerLink="/admin/catalogs" class="text-sky-700 underline"
            >catalogs</a
          >
          <a routerLink="/admin/staff" class="text-sky-700 underline">staff</a>
          <a routerLink="/admin/audit-logs" class="text-sky-700 underline"
            >audit-logs</a
          >
        </div>

        <div class="flex flex-wrap gap-3 text-slate-500">
          <span
            >Chưa chọn role — bấm 1 trong 4 nút ở trên để bắt đầu test.</span
          >
          <a routerLink="/login" class="text-sky-700 underline">/login</a>
          <a routerLink="/register" class="text-sky-700 underline">/register</a>
          <a routerLink="/403" class="text-sky-700 underline">/403</a>
          <a routerLink="/khong-ton-tai" class="text-sky-700 underline"
            >404 test</a
          >
        </div>
      </div>
    }
  `,
})
export class DevRouteNavComponent {
  private readonly tokenStore = inject(TokenStoreService);
  private readonly router = inject(Router);
  protected readonly isProd = environment.production;
  protected readonly currentRole = this.tokenStore.userRole;
  protected readonly Role = Role;

  private readonly roleHome: Record<Role, string> = {
    [Role.PATIENT]: '/patient',
    [Role.DOCTOR]: '/doctor',
    [Role.RECEPTIONIST]: '/receptionist',
    [Role.ADMIN]: '/admin',
  };

  devLoginAs(role: Role): void {
    this.tokenStore.setSession('dev-fake-token', role);
    // this.router.navigateByUrl(this.roleHome[role] ?? '/');
  }

  clear(): void {
    this.tokenStore.clear();
    this.router.navigateByUrl('/login');
  }
}
