import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  inject,
  signal,
  ViewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Role } from '@shared/enums/role.enum';
import { Gender } from '@shared/enums/gender.enum';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent, RouterLink],
  templateUrl: './register.page.html',
})
export class RegisterPage implements OnDestroy {
  // =========================
  // Google registration flow
  // =========================

  readonly googleCompletion =
    inject(ActivatedRoute).snapshot.queryParamMap.get('google') === 'complete';

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected fullName = '';
  protected gender: Gender | '' = '';
  protected dateOfBirth = '';

  readonly today = new Date().toISOString().slice(0, 10);

  // =========================
  // Normal registration + OTP
  // =========================

  protected phone = '';
  protected email = '';
  protected password = '';

  /**
   * ID của phiên đăng ký do backend trả về
   * sau khi requestRegisterOtp() thành công.
   */
  protected registrationId = '';

  @ViewChildren('otpInput')
  private readonly otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  protected readonly step = signal<1 | 2>(1);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly resendCountdown = signal(180);
  protected readonly showPassword = signal(false);

  protected readonly otpDigits = signal([
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  private resendTimer: ReturnType<typeof setInterval> | null = null;

  // =========================
  // Google registration
  // =========================

  protected complete(): void {
    if (
      !this.gender ||
      !this.fullName.trim() ||
      !this.dateOfBirth ||
      this.loading()
    ) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.auth
      .completeGoogleRegistration({
        fullName: this.fullName.trim(),
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

          void this.router.navigateByUrl(
            homes[res.role] ?? '/',
          );
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

  // =========================
  // Normal registration
  // =========================

  protected submitRegister(): void {
    this.errorMessage.set('');

    const fullName = this.fullName.trim();
    const phoneNumber = this.phone.trim();
    const email = this.email.trim();
    const password = this.password;

    if (
      !fullName ||
      !phoneNumber ||
      !email ||
      !password ||
      !this.gender ||
      !this.dateOfBirth
    ) {
      this.errorMessage.set(
        'Vui lòng nhập đầy đủ thông tin.',
      );
      return;
    }

    if (password.length < 8) {
      this.errorMessage.set(
        'Mật khẩu phải có ít nhất 8 ký tự.',
      );
      return;
    }

    this.loading.set(true);

    const payload = {
      fullName,
      phoneNumber,
      email,
      password,
      gender: this.gender,
      dateOfBirth: this.dateOfBirth,
    };

    this.auth
      .requestRegisterOtp(payload)
      .subscribe({
        next: (res) => {
          this.loading.set(false);

          /**
           * Backend tạo registration session
           * và trả registrationId để dùng ở bước verify OTP.
           */
          this.registrationId = res.registrationId;

          this.step.set(2);
          this.clearOtp();
          this.startResendCountdown();

          setTimeout(() => {
            this.otpInputs.first?.nativeElement.focus();
          });
        },

        error: (error: HttpErrorResponse) => {
          this.loading.set(false);

          this.errorMessage.set(
            error.error?.message ??
              'Không thể gửi mã OTP. Vui lòng thử lại.',
          );
        },
      });
  }

  // =========================
  // OTP input
  // =========================

  protected onOtpInput(
    event: Event,
    index: number,
  ): void {
    const input = event.target as HTMLInputElement;

    const value = input.value
      .replace(/\D/g, '')
      .slice(-1);

    const digits = [...this.otpDigits()];
    digits[index] = value;

    this.otpDigits.set(digits);

    if (value && index < 5) {
      setTimeout(() => {
        this.otpInputs
          .get(index + 1)
          ?.nativeElement.focus();
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

    const digits = [
      '',
      '',
      '',
      '',
      '',
      '',
    ];

    pastedValue
      .split('')
      .forEach((digit, index) => {
        digits[index] = digit;
      });

    this.otpDigits.set(digits);

    setTimeout(() => {
      const focusIndex = Math.min(
        pastedValue.length,
        5,
      );

      this.otpInputs
        .get(focusIndex)
        ?.nativeElement.focus();
    });
  }

  protected onOtpKeydown(
    event: KeyboardEvent,
    index: number,
  ): void {
    if (
      event.key === 'Backspace' &&
      !this.otpDigits()[index] &&
      index > 0
    ) {
      setTimeout(() => {
        this.otpInputs
          .get(index - 1)
          ?.nativeElement.focus();
      });
    }
  }

  // =========================
  // Verify OTP
  // =========================

  protected verifyOtp(): void {
    this.errorMessage.set('');

    const otp = this.otpDigits().join('');

    if (otp.length !== 6) {
      this.errorMessage.set(
        'Vui lòng nhập đủ 6 số OTP.',
      );
      return;
    }

    if (!this.registrationId) {
      this.errorMessage.set(
        'Phiên đăng ký không hợp lệ. Vui lòng đăng ký lại.',
      );
      return;
    }

    this.loading.set(true);

    this.auth
      .verifyRegisterOtp(
        this.registrationId,
        otp,
      )
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.stopResendCountdown();

          /**
           * RegisterVerifyResponse luôn trả role PATIENT
           * đối với luồng đăng ký bệnh nhân.
           */
          const homes: Record<Role, string> = {
            [Role.PATIENT]: '/patient',
            [Role.DOCTOR]: '/doctor',
            [Role.RECEPTIONIST]: '/receptionist',
            [Role.ADMIN]: '/admin',
          };

          void this.router.navigateByUrl(
            homes[res.role] ?? '/patient',
          );
        },

        error: (error: HttpErrorResponse) => {
          this.loading.set(false);

          this.errorMessage.set(
            error.error?.message ??
              'Mã OTP không hợp lệ hoặc đã hết hạn.',
          );
        },
      });
  }

  // =========================
  // Resend OTP
  // =========================

  protected resendOtp(): void {
    if (
      this.resendCountdown() > 0 ||
      this.loading()
    ) {
      return;
    }

    this.errorMessage.set('');

    if (
      !this.fullName.trim() ||
      !this.phone.trim() ||
      !this.email.trim() ||
      !this.password ||
      !this.gender ||
      !this.dateOfBirth
    ) {
      this.errorMessage.set(
        'Thông tin đăng ký chưa đầy đủ. Vui lòng kiểm tra lại.',
      );
      return;
    }

    this.loading.set(true);

    const payload = {
      fullName: this.fullName.trim(),
      phoneNumber: this.phone.trim(),
      email: this.email.trim(),
      password: this.password,
      gender: this.gender,
      dateOfBirth: this.dateOfBirth,
    };

    this.auth
      .requestRegisterOtp(payload)
      .subscribe({
        next: (res) => {
          this.loading.set(false);

          /**
           * Backend tạo registrationId mới
           * cho lần gửi OTP này.
           */
          this.registrationId = res.registrationId;

          this.clearOtp();
          this.startResendCountdown();

          setTimeout(() => {
            this.otpInputs.first?.nativeElement.focus();
          });
        },

        error: (error: HttpErrorResponse) => {
          this.loading.set(false);

          this.errorMessage.set(
            error.error?.message ??
              'Không thể gửi lại mã OTP.',
          );
        },
      });
  }

  // =========================
  // Navigation
  // =========================

  protected backToRegister(): void {
    if (this.loading()) {
      return;
    }

    this.stopResendCountdown();
    this.errorMessage.set('');
    this.clearOtp();

    this.registrationId = '';

    this.step.set(1);
  }

  // =========================
  // OTP countdown
  // =========================

  private clearOtp(): void {
    this.otpDigits.set([
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  }

  private startResendCountdown(): void {
    this.stopResendCountdown();

    this.resendCountdown.set(180);

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

  ngOnDestroy(): void {
    this.stopResendCountdown();
  }
}