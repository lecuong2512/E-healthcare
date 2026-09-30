import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { TokenStoreService, UserProfileInfo } from '../../../core/services/token-store.service';
import { Role } from '@shared/enums';

export const DEFAULT_USERS: Record<Role, UserProfileInfo> = {
  [Role.PATIENT]: {
    fullName: 'Nguyễn An',
    email: 'nguyenan@ehealth.vn',
    phoneNumber: '0912345678',
    role: Role.PATIENT,
  },
  [Role.DOCTOR]: {
    fullName: 'Trần Bình',
    email: 'tranbinh.md@ehealth.vn',
    phoneNumber: '0987654321',
    role: Role.DOCTOR,
  },
  [Role.RECEPTIONIST]: {
    fullName: 'Lê Cường',
    email: 'lecuong.rec@ehealth.vn',
    phoneNumber: '0901234567',
    role: Role.RECEPTIONIST,
  },
  [Role.ADMIN]: {
    fullName: 'Phạm Dũng',
    email: 'phamdung.admin@ehealth.vn',
    phoneNumber: '0933334444',
    role: Role.ADMIN,
  },
};

export const ROLE_CONFIG: Record<Role, { label: string; badgeClass: string }> = {
  [Role.PATIENT]: {
    label: 'Bệnh nhân',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  [Role.DOCTOR]: {
    label: 'Bác sĩ',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [Role.RECEPTIONIST]: {
    label: 'Lễ tân',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  [Role.ADMIN]: {
    label: 'Quản trị viên',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
};

export function getInitials(name: string): string {
  if (!name) return 'EH';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgClass],
  template: `
<header class="sticky top-0 z-40 w-full border-b border-slate-200 bg-white shadow-xs">
  <div class="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-4 lg:px-6">
    <!-- Brand Logo -->
    <a 
      routerLink="/" 
      class="inline-flex items-center gap-2 shrink-0 cursor-pointer transition-opacity hover:opacity-90"
      aria-label="Trang chủ E-Healthcare"
    >
      <div class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm">
        <img
          [src]="logo"
          alt="E-Healthcare Logo"
          class="h-full w-full object-contain"
        />
      </div>

      <span class="font-bold text-base tracking-tight text-slate-900">
        E-Healthcare
      </span>

      <span class="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
        Medical
      </span>
    </a>

    <!-- Role-based Navigation Bar (Desktop & Tablet) -->
    @if (isAuthenticated() && currentRole()) {
      <nav class="hidden md:flex items-center gap-1 lg:gap-1.5" aria-label="Điều hướng phân hệ">
        @switch (currentRole()) {
          @case (Role.PATIENT) {
            <a
              routerLink="/patient/doctor-search"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Tìm bác sĩ
            </a>
            <a
              routerLink="/patient/history"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Lịch sử khám &amp; Đơn thuốc
            </a>
            <a
              routerLink="/patient/profile"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Hồ sơ sức khỏe
            </a>
          }
          @case (Role.DOCTOR) {
            <a
              routerLink="/doctor/queue"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Hàng đợi khám
            </a>
            <a
              routerLink="/doctor/schedule"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Lịch khám &amp; Ca trực
            </a>
          }
          @case (Role.RECEPTIONIST) {
            <a
              routerLink="/receptionist/checkin"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Tiếp đón check-in
            </a>
            <a
              routerLink="/receptionist/walkin"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Đặt lịch vãng lai
            </a>
            <a
              routerLink="/receptionist/queue-board"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Bảng gọi số Smart TV
            </a>
          }
          @case (Role.ADMIN) {
            <a
              routerLink="/admin/dashboard"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Dashboard KPI
            </a>
            <a
              routerLink="/admin/catalogs"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Danh mục y tế
            </a>
            <a
              routerLink="/admin/staff"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Quản lý nhân sự
            </a>
            <a
              routerLink="/admin/audit-logs"
              routerLinkActive="bg-sky-50 text-sky-700 font-semibold"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Nhật ký kiểm toán
            </a>
          }
        }
      </nav>
    }

    <!-- Right: User Avatar & Dropdown or Login -->
    <div class="flex items-center gap-2">
      @if (isAuthenticated() && currentRole()) {
        <!-- User Pill & Avatar Dropdown Trigger -->
        <div class="relative">
          <button
            type="button"
            (click)="toggleUserMenu()"
            class="flex items-center gap-2.5 rounded-full p-1 pl-2 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            [attr.aria-expanded]="isUserMenuOpen()"
            aria-haspopup="true"
            aria-label="Tài khoản người dùng"
          >
            <!-- User Info: Full Name + Role Badge -->
            <div class="hidden sm:flex flex-col items-end text-right">
              <span class="text-sm font-semibold text-slate-800 leading-tight">
                {{ currentUser().fullName }}
              </span>
              <span
                class="mt-0.5 inline-flex items-center rounded-full border px-1.5 py-0.2 text-[10px] font-medium leading-normal"
                [ngClass]="roleConfig().badgeClass"
              >
                {{ roleConfig().label }}
              </span>
            </div>

            <!-- Avatar Circle with initials -->
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white shadow-xs ring-2 ring-white"
            >
              {{ userInitials() }}
            </span>

            <!-- Dropdown caret -->
            <svg class="h-4 w-4 text-slate-400 max-sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown Menu -->
          @if (isUserMenuOpen()) {
            <!-- Backdrop -->
            <div class="fixed inset-0 z-40" (click)="closeUserMenu()" aria-hidden="true"></div>

            <div
              class="absolute right-0 top-full mt-2 w-72 origin-top-right rounded-2xl border border-slate-200 bg-white py-1 shadow-xl z-50"
              role="menu"
              aria-orientation="vertical"
            >
              <!-- Dropdown Header: Họ tên, Email/SĐT, Badge vai trò -->
              <div class="border-b border-slate-100 px-4 py-3">
                <div class="flex items-center gap-3">
                  <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
                    {{ userInitials() }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-slate-900">
                      {{ currentUser().fullName }}
                    </p>
                    <p class="truncate text-xs text-slate-500">
                      {{ userContact() }}
                    </p>
                  </div>
                </div>
                <div class="mt-2.5">
                  <span
                    class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold"
                    [ngClass]="roleConfig().badgeClass"
                  >
                    {{ roleConfig().label }}
                  </span>
                </div>
              </div>

              <!-- Links for Patient: PHR profile & Medical history -->
              @if (currentRole() === Role.PATIENT) {
                <div class="border-b border-slate-100 py-1" role="none">
                  <a
                    routerLink="/patient/profile"
                    (click)="closeUserMenu()"
                    class="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                    role="menuitem"
                  >
                    <span class="text-base" aria-hidden="true">📋</span>
                    <span>Hồ sơ sức khỏe cá nhân (PHR)</span>
                  </a>
                  <a
                    routerLink="/patient/history"
                    (click)="closeUserMenu()"
                    class="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                    role="menuitem"
                  >
                    <span class="text-base" aria-hidden="true">📑</span>
                    <span>Lịch sử khám bệnh</span>
                  </a>
                </div>
              }

              <!-- Logout Button -->
              <div class="py-1" role="none">
                <button
                  type="button"
                  (click)="logout()"
                  class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                  role="menuitem"
                >
                  <span class="text-base" aria-hidden="true">🚪</span>
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          }
        </div>
      } @else {
        <a
          routerLink="/login"
          class="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          Đăng nhập
        </a>
      }
    </div>
  </div>

  <!-- Mobile Sub-navigation Bar for Roles (< md screens) -->
  @if (isAuthenticated() && currentRole()) {
    <nav class="flex md:hidden overflow-x-auto border-t border-slate-100 bg-slate-50/90 px-3 py-1.5 gap-1.5 text-xs font-medium scrollbar-none" aria-label="Điều hướng phân hệ trên di động">
      @switch (currentRole()) {
        @case (Role.PATIENT) {
          <a
            routerLink="/patient/doctor-search"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Tìm bác sĩ
          </a>
          <a
            routerLink="/patient/history"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Lịch sử khám &amp; Đơn thuốc
          </a>
          <a
            routerLink="/patient/profile"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Hồ sơ sức khỏe
          </a>
        }
        @case (Role.DOCTOR) {
          <a
            routerLink="/doctor/queue"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Hàng đợi khám
          </a>
          <a
            routerLink="/doctor/schedule"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Lịch khám &amp; Ca trực
          </a>
        }
        @case (Role.RECEPTIONIST) {
          <a
            routerLink="/receptionist/checkin"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Tiếp đón check-in
          </a>
          <a
            routerLink="/receptionist/walkin"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Đặt lịch vãng lai
          </a>
          <a
            routerLink="/receptionist/queue-board"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Bảng gọi số Smart TV
          </a>
        }
        @case (Role.ADMIN) {
          <a
            routerLink="/admin/dashboard"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Dashboard KPI
          </a>
          <a
            routerLink="/admin/catalogs"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Danh mục y tế
          </a>
          <a
            routerLink="/admin/staff"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Quản lý nhân sự
          </a>
          <a
            routerLink="/admin/audit-logs"
            routerLinkActive="bg-white text-sky-700 font-semibold shadow-xs"
            class="shrink-0 rounded-md px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Nhật ký kiểm toán
          </a>
        }
      }
    </nav>
  }
</header>`,
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly tokenStore = inject(TokenStoreService);
  private readonly router = inject(Router);

  readonly logo = 'assets/logo.png';
  readonly Role = Role;
  readonly isUserMenuOpen = signal(false);

  readonly currentRole = computed<Role | null>(() => {
    return (this.tokenStore.userRole() as Role) || null;
  });

  readonly isAuthenticated = computed<boolean>(() => {
    return this.tokenStore.isAuthenticated() || !!this.currentRole();
  });

  readonly currentUser = computed<UserProfileInfo>(() => {
    const storeUser = this.tokenStore.currentUser();
    if (storeUser && storeUser.fullName) return storeUser;

    try {
      const saved = localStorage.getItem('currentUser');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.fullName) return parsed;
      }
    } catch {}

    const role = this.currentRole() ?? Role.PATIENT;
    return DEFAULT_USERS[role] ?? DEFAULT_USERS[Role.PATIENT];
  });

  readonly userInitials = computed<string>(() => {
    return getInitials(this.currentUser().fullName);
  });

  readonly roleConfig = computed(() => {
    const role = this.currentRole() ?? Role.PATIENT;
    return ROLE_CONFIG[role] ?? {
      label: 'Người dùng',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  });

  readonly userContact = computed<string>(() => {
    const user = this.currentUser();
    return user.email || user.phoneNumber || 'Tài khoản hệ thống';
  });

  toggleUserMenu(): void {
    this.isUserMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.isUserMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeUserMenu();
  }

  logout(): void {
    this.closeUserMenu();
    this.authService.logout().subscribe({
      next: () => {
        this.tokenStore.clear();
        void this.router.navigateByUrl('/login');
      },
      error: () => {
        this.tokenStore.clear();
        void this.router.navigateByUrl('/login');
      },
    });
  }
}
