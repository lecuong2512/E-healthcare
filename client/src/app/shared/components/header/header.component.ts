import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Role } from '@shared/enums';

@Component({
  selector: 'app-navbar, app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="sticky top-0 z-40 w-full border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-3 px-4 lg:px-6">
        <!-- Logo -->
        <a
          [routerLink]="homeRoute()"
          class="inline-flex items-center gap-2 shrink-0 cursor-pointer transition-opacity hover:opacity-90"
        >
          <div class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm">
            <img
              [src]="logo"
              alt="E-Healthcare Logo"
              class="h-full w-full object-contain"
            />
          </div>

          <span class="font-semibold text-base text-slate-900">
            E-Healthcare
          </span>

          <span class="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-600">
            Medical
          </span>
        </a>

        <!-- Role-based Navigation Menu -->
        <nav class="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1" aria-label="Điều hướng phân hệ">
          @switch (userRole()) {
            @case (Role.PATIENT) {
              <a
                routerLink="/patient/doctor-search"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Tìm bác sĩ
              </a>
              <a
                routerLink="/patient/history"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Lịch sử khám
              </a>
              <a
                routerLink="/patient/profile"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Hồ sơ sức khỏe
              </a>
            }
            @case (Role.DOCTOR) {
              <a
                routerLink="/doctor/queue"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Hàng đợi khám
              </a>
              <a
                routerLink="/doctor/schedule"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Cấu hình ca trực
              </a>
            }
            @case (Role.RECEPTIONIST) {
              <a
                routerLink="/receptionist/checkin"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Bàn tiếp đón check-in
              </a>
              <a
                routerLink="/receptionist/walkin"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Tiếp nhận vãng lai
              </a>
            }
            @case (Role.ADMIN) {
              <a
                routerLink="/admin/dashboard"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Dashboard KPI
              </a>
              <a
                routerLink="/admin/catalogs"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Danh mục y tế
              </a>
              <a
                routerLink="/admin/staff"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Nhân sự
              </a>
              <a
                routerLink="/admin/audit-logs"
                routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
                class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                Nhật ký kiểm toán
              </a>
            }
          }
        </nav>

        <!-- Right profile avatar -->
        <div class="flex items-center gap-3 shrink-0">
          <span
            aria-label="Tài khoản TN"
            class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white"
          >
            TN
          </span>
        </div>
      </div>
    </header>
  `,
})
export class NavbarComponent {
  protected readonly authService = inject(AuthService);
  protected readonly Role = Role;
  readonly logo = 'assets/logo.png';

  readonly userRole = computed(() => {
    return this.authService.userRole ? this.authService.userRole() : null;
  });

  readonly homeRoute = computed(() => {
    switch (this.userRole()) {
      case Role.PATIENT:
        return '/patient/doctor-search';
      case Role.DOCTOR:
        return '/doctor/queue';
      case Role.RECEPTIONIST:
        return '/receptionist/checkin';
      case Role.ADMIN:
        return '/admin/dashboard';
      default:
        return '/';
    }
  });
}

export { NavbarComponent as HeaderComponent };
