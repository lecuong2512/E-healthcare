import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent, RouterLink],
  templateUrl: './forgot-password.page.html',
})
export class ForgotPasswordPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChildren('otpInput')
  private readonly otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  protected identifier = '';
  protected newPassword = '';
  protected confirmPassword = '';

  protected readonly step = signal<1 | 2 | 3 | 4>(1);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly resendCountdown = signal(300);

  protected readonly showNewPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);

  protected readonly otpDigits = signal(['', '', '', '', '', '']);

  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private redirectTimeout: ReturnType<typeof setTimeout> | null = null;

  // =========================
  // Step 1: Send OTP
  // =========================

  protected sendOtp(): void {
    const raw = this.identifier.trim();
    if (!raw) {
      this.errorMessage.set('Vui lòng nhập Email hoặc Số điện thoại.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.auth.forgotPassword(raw).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.step.set(2);
        this.clearOtp();
        this.startResendCountdown(res?.expiresIn ?? 300);

        setTimeout(() => {
          this.otpInputs.first?.nativeElement.focus();
        });
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.error?.message ?? 'Không thể gửi mã OTP. Vui lòng thử lại.',
        );
      },
    });
  }

  // =========================
  // Step 2: OTP input & handling
  // =========================

  protected onOtpInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(-1);

    const digits = [...this.otpDigits()];
    digits[index] = value;
    this.otpDigits.set(digits);

    if (value && index < 5) {
      setTimeout(() => {
        this.otpInputs.get(index + 1)?.nativeElement.focus();
      });
    }
  }

  protected onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();

    const pastedValue = event.clipboardData
      ?.getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);

    if (!pastedValue) {
      return;
    }

    const digits = ['', '', '', '', '', ''];
    pastedValue.split('').forEach((digit, index) => {
      digits[index] = digit;
    });

    this.otpDigits.set(digits);

    setTimeout(() => {
      const focusIndex = Math.min(pastedValue.length, 5);
      this.otpInputs.get(focusIndex)?.nativeElement.focus();
    });
  }

  protected onOtpKeydown(event: KeyboardEvent, index: number): void {
    if (
      event.key === 'Backspace' &&
      !this.otpDigits()[index] &&
      index > 0
    ) {
      setTimeout(() => {
        this.otpInputs.get(index - 1)?.nativeElement.focus();
      });
    }
  }

  protected verifyOtp(): void {
    this.errorMessage.set('');
    const otp = this.otpDigits().join('');

    if (otp.length !== 6) {
      this.errorMessage.set('Vui lòng nhập đủ 6 số OTP.');
      return;
    }

    this.step.set(3);
  }

  protected resendOtp(): void {
    if (this.resendCountdown() > 0 || this.loading()) {
      return;
    }

    const raw = this.identifier.trim();
    if (!raw) {
      this.errorMessage.set('Vui lòng nhập Email hoặc Số điện thoại.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.auth.forgotPassword(raw).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.clearOtp();
        this.startResendCountdown(res?.expiresIn ?? 300);

        setTimeout(() => {
          this.otpInputs.first?.nativeElement.focus();
        });
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.error?.message ?? 'Không thể gửi lại mã OTP. Vui lòng thử lại.',
        );
      },
    });
  }

  // =========================
  // Step 3: Reset password
  // =========================

  protected submitReset(): void {
    this.errorMessage.set('');

    const newPassword = this.newPassword;
    const confirmPassword = this.confirmPassword;

    if (!newPassword || !confirmPassword) {
      this.errorMessage.set('Vui lòng nhập đầy đủ mật khẩu mới và xác nhận mật khẩu.');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.errorMessage.set('Mật khẩu nhập lại không khớp.');
      return;
    }

    const isValidPassword =
      newPassword.length >= 8 &&
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[^A-Za-z0-9]/.test(newPassword);

    if (!isValidPassword) {
      this.errorMessage.set(
        'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.',
      );
      return;
    }

    const otp = this.otpDigits().join('');
    if (otp.length !== 6) {
      this.errorMessage.set('Mã OTP không hợp lệ. Vui lòng quay lại bước nhập OTP.');
      return;
    }

    this.loading.set(true);

    this.auth
      .resetPassword({
        identifier: this.identifier.trim(),
        otp,
        newPassword,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.step.set(4);
          this.successMessage.set(
            'Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...',
          );
          this.redirectTimeout = setTimeout(() => {
            this.goToLogin();
          }, 2000);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(
            err.error?.message ??
              'Đặt lại mật khẩu không thành công. Vui lòng thử lại.',
          );
        },
      });
  }

  // =========================
  // Navigation & helpers
  // =========================

  protected goToLogin(): void {
    if (this.redirectTimeout) {
      clearTimeout(this.redirectTimeout);
      this.redirectTimeout = null;
    }
    void this.router.navigateByUrl('/login');
  }

  protected backToStep(targetStep: 1 | 2): void {
    if (this.loading()) return;
    this.errorMessage.set('');
    this.step.set(targetStep);
  }

  private clearOtp(): void {
    this.otpDigits.set(['', '', '', '', '', '']);
  }

  private startResendCountdown(seconds = 300): void {
    this.stopResendCountdown();
    this.resendCountdown.set(seconds);

    this.resendTimer = setInterval(() => {
      const current = this.resendCountdown();
      if (current <= 1) {
        this.resendCountdown.set(0);
        this.stopResendCountdown();
        return;
      }
      this.resendCountdown.set(current - 1);
    }, 1000);
  }

  private stopResendCountdown(): void {
    if (this.resendTimer !== null) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }

  protected formatCountdown(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    this.stopResendCountdown();
    if (this.redirectTimeout) {
      clearTimeout(this.redirectTimeout);
      this.redirectTimeout = null;
    }
  }
}
