import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../../core/services/auth.service';
import { Role } from '@shared/enums/role.enum';

/**
 * Bổ sung thông tin bắt buộc cho tài khoản Google mới trước khi kích hoạt.
 */
@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (googleCompletion) {
      <section
        class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4"
      >
        <h1 class="mb-6 text-xl font-semibold">Hoàn tất tài khoản Google</h1>
        <p class="mb-4 text-sm text-slate-600">
          Bổ sung thông tin để tạo hồ sơ sức khỏe cá nhân.
        </p>
        <form
          #form="ngForm"
          (ngSubmit)="complete()"
          class="flex flex-col gap-4"
        >
          <label
            >Họ và tên
            <input
              name="fullName"
              [(ngModel)]="fullName"
              required
              maxlength="100"
              autocomplete="name"
              [disabled]="loading()"
              class="mt-1 min-h-11 w-full rounded border px-3"
            />
          </label>
          <label
            >Giới tính
            <select
              name="gender"
              [(ngModel)]="gender"
              required
              [disabled]="loading()"
              class="mt-1 min-h-11 w-full rounded border px-3"
            >
              <option value="">Chọn giới tính</option>
              <option value="MALE">Nam</option>
              <option value="FEMALE">Nữ</option>
              <option value="OTHER">Khác</option>
            </select>
          </label>
          <label
            >Ngày sinh
            <input
              type="date"
              name="dateOfBirth"
              [(ngModel)]="dateOfBirth"
              required
              [max]="today"
              [disabled]="loading()"
              class="mt-1 min-h-11 w-full rounded border px-3"
            />
          </label>
          @if (errorMessage()) {
            <p role="alert" class="text-sm text-red-600">
              {{ errorMessage() }}
            </p>
          }
          <button
            type="submit"
            [disabled]="form.invalid || loading() || !fullName.trim()"
            class="min-h-11 rounded bg-sky-700 px-4 text-white disabled:opacity-50"
          >
            {{ loading() ? 'Đang xử lý…' : 'Hoàn tất đăng ký' }}
          </button>
          <a routerLink="/login" class="text-center text-sm text-sky-700"
            >Quay lại đăng nhập</a
          >
        </form>
      </section>
    } @else {
      <div class="p-6 text-slate-500">[TODO] Đăng ký OTP — SRS-AUTH-01</div>
    }
  `,
})
export class RegisterPage {
  readonly googleCompletion =
    inject(ActivatedRoute).snapshot.queryParamMap.get('google') === 'complete';
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  fullName = '';
  gender: 'MALE' | 'FEMALE' | 'OTHER' | '' = '';
  dateOfBirth = '';
  readonly today = new Date().toISOString().slice(0, 10);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  complete(): void {
    if (
      !this.gender ||
      !this.fullName.trim() ||
      !this.dateOfBirth ||
      this.loading()
    )
      return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth
      .completeGoogleRegistration({
        fullName: this.fullName,
        gender: this.gender,
        dateOfBirth: this.dateOfBirth,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          const homes: Record<Role, string> = {
            [Role.PATIENT]: '/patient',
            [Role.DOCTOR]: '/doctor',
            [Role.RECEPTIONIST]: '/receptionist',
            [Role.ADMIN]: '/admin',
          };
          void this.router.navigateByUrl(homes[res.role]);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(
            typeof err.error?.message === 'string'
              ? err.error.message
              : 'Không thể hoàn tất đăng ký. Vui lòng thử lại.',
          );
        },
      });
  }
}
