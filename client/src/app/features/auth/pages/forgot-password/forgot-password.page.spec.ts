import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ForgotPasswordPage } from './forgot-password.page';
import { AuthService } from '../../../../core/services/auth.service';

describe('ForgotPasswordPage', () => {
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let component: ForgotPasswordPage;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'forgotPassword',
      'resetPassword',
    ]);

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);

    fixture = TestBed.createComponent(ForgotPasswordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with step 1 and default state', () => {
    expect(component['step']()).toBe(1);
    expect(component['loading']()).toBe(false);
    expect(component['errorMessage']()).toBe('');
    expect(component['otpDigits']()).toEqual(['', '', '', '', '', '']);
  });

  describe('Step 1: Send OTP', () => {
    it('should reject empty identifier', () => {
      component['identifier'] = '   ';
      component['sendOtp']();

      expect(component['errorMessage']()).toBe(
        'Vui lòng nhập Email hoặc Số điện thoại.',
      );
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('should send OTP and advance to step 2 on success', () => {
      authService.forgotPassword.and.returnValue(of({ expiresIn: 300 }));

      component['identifier'] = 'patient@example.com';
      component['sendOtp']();

      expect(authService.forgotPassword).toHaveBeenCalledWith('patient@example.com');
      expect(component['loading']()).toBe(false);
      expect(component['step']()).toBe(2);
      expect(component['resendCountdown']()).toBe(300);
      expect(component['errorMessage']()).toBe('');
    });

    it('should show error message when sending OTP fails', () => {
      authService.forgotPassword.and.returnValue(
        throwError(() => ({
          error: { message: 'Tài khoản không tồn tại hoặc đã bị khóa.' },
        })),
      );

      component['identifier'] = 'notfound@example.com';
      component['sendOtp']();

      expect(component['loading']()).toBe(false);
      expect(component['errorMessage']()).toBe(
        'Tài khoản không tồn tại hoặc đã bị khóa.',
      );
      expect(component['step']()).toBe(1);
    });
  });

  describe('Step 2: OTP verification & resend', () => {
    beforeEach(() => {
      component['identifier'] = 'patient@example.com';
      component['step'].set(2);
    });

    it('should reject OTP with fewer than 6 digits', () => {
      component['otpDigits'].set(['1', '2', '3', '', '', '']);
      component['verifyOtp']();

      expect(component['errorMessage']()).toBe('Vui lòng nhập đủ 6 số OTP.');
      expect(component['step']()).toBe(2);
    });

    it('should advance to step 3 when 6 digits are provided', () => {
      component['otpDigits'].set(['1', '2', '3', '4', '5', '6']);
      component['verifyOtp']();

      expect(component['errorMessage']()).toBe('');
      expect(component['step']()).toBe(3);
    });

    it('should distribute pasted OTP into 6 digits', () => {
      const preventDefault = jasmine.createSpy('preventDefault');
      const clipboardEvent = {
        preventDefault,
        clipboardData: { getData: () => '987654' },
      } as unknown as ClipboardEvent;

      component['onOtpPaste'](clipboardEvent);

      expect(preventDefault).toHaveBeenCalled();
      expect(component['otpDigits']()).toEqual(['9', '8', '7', '6', '5', '4']);
    });

    it('should resend OTP when countdown is 0', () => {
      authService.forgotPassword.and.returnValue(of({ expiresIn: 300 }));
      component['resendCountdown'].set(0);

      component['resendOtp']();

      expect(authService.forgotPassword).toHaveBeenCalledWith('patient@example.com');
      expect(component['resendCountdown']()).toBe(300);
    });

    it('should not resend OTP if countdown is active', () => {
      component['resendCountdown'].set(120);
      component['resendOtp']();

      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('Step 3: Reset Password', () => {
    beforeEach(() => {
      component['identifier'] = 'patient@example.com';
      component['otpDigits'].set(['1', '2', '3', '4', '5', '6']);
      component['step'].set(3);
    });

    it('should reject empty passwords', () => {
      component['newPassword'] = '';
      component['confirmPassword'] = '';
      component['submitReset']();

      expect(component['errorMessage']()).toBe(
        'Vui lòng nhập đầy đủ mật khẩu mới và xác nhận mật khẩu.',
      );
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('should reject mismatched confirmPassword', () => {
      component['newPassword'] = 'Abcd123!';
      component['confirmPassword'] = 'Different123!';
      component['submitReset']();

      expect(component['errorMessage']()).toBe('Mật khẩu nhập lại không khớp.');
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('should reject weak password', () => {
      component['newPassword'] = 'weakpass';
      component['confirmPassword'] = 'weakpass';
      component['submitReset']();

      expect(component['errorMessage']()).toBe(
        'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.',
      );
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('should reset password, show step 4 success, and redirect to /login', fakeAsync(() => {
      authService.resetPassword.and.returnValue(of(undefined as unknown as void));

      component['newPassword'] = 'ValidPass123!';
      component['confirmPassword'] = 'ValidPass123!';
      component['submitReset']();

      expect(authService.resetPassword).toHaveBeenCalledWith({
        identifier: 'patient@example.com',
        otp: '123456',
        newPassword: 'ValidPass123!',
      });

      expect(component['loading']()).toBe(false);
      expect(component['step']()).toBe(4);

      tick(2000);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    }));

    it('should show error when backend fails to reset password', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({
          error: { message: 'Mã OTP không hợp lệ hoặc đã hết hạn.' },
        })),
      );

      component['newPassword'] = 'ValidPass123!';
      component['confirmPassword'] = 'ValidPass123!';
      component['submitReset']();

      expect(component['loading']()).toBe(false);
      expect(component['errorMessage']()).toBe(
        'Mã OTP không hợp lệ hoặc đã hết hạn.',
      );
      expect(component['step']()).toBe(3);
    });
  });

  describe('Navigation & Helpers', () => {
    it('formatCountdown formats seconds into mm:ss', () => {
      expect(component['formatCountdown'](300)).toBe('05:00');
      expect(component['formatCountdown'](59)).toBe('00:59');
      expect(component['formatCountdown'](0)).toBe('00:00');
    });

    it('backToStep navigates between steps and clears errors', () => {
      component['errorMessage'].set('Some error');
      component['backToStep'](1);

      expect(component['step']()).toBe(1);
      expect(component['errorMessage']()).toBe('');
    });

    it('goToLogin navigates directly to /login', () => {
      component['goToLogin']();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });
  });
});
