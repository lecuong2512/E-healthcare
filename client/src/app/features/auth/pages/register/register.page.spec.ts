import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { RegisterPage } from './register.page';
import { AuthService } from '../../../../core/services/auth.service';
import { Gender } from '@shared/enums/gender.enum';
import { Role } from '@shared/enums/role.enum';

describe('RegisterPage', () => {
  let fixture: ComponentFixture<RegisterPage>;
  let component: RegisterPage;

  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>(
      'AuthService',
      [
        'requestRegisterOtp',
        'verifyRegisterOtp',
        'completeGoogleRegistration',
      ],
    );

    router = jasmine.createSpyObj<Router>(
      'Router',
      ['navigateByUrl'],
    );

    router.navigateByUrl.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: Router,
          useValue: router,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: () => null,
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize registration state correctly', () => {
    expect(component['step']()).toBe(1);
    expect(component['loading']()).toBe(false);
    expect(component['errorMessage']()).toBe('');
    expect(component['resendCountdown']()).toBe(180);
    expect(component['registrationId']).toBe('');

    expect(component['otpDigits']()).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('should show validation error when registration information is incomplete', () => {
    component['submitRegister']();

    expect(component['errorMessage']()).toBe(
      'Vui lòng nhập đầy đủ thông tin.',
    );

    expect(
      authService.requestRegisterOtp,
    ).not.toHaveBeenCalled();
  });

  it('should reject password shorter than 8 characters', () => {
    component['fullName'] = 'Nguyễn Tùng';
    component['phone'] = '0838413268';
    component['email'] = 'test@example.com';
    component['password'] = '1234567';
    component['gender'] = Gender.MALE;
    component['dateOfBirth'] = '2000-01-01';

    component['submitRegister']();

    expect(component['errorMessage']()).toBe(
      'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.',
    );

    expect(
      authService.requestRegisterOtp,
    ).not.toHaveBeenCalled();
  });

  it('should reject password without required character types', () => {
    component['fullName'] = 'Nguyễn Tùng';
    component['phone'] = '0838413268';
    component['email'] = 'test@example.com';
    component['password'] = 'abcdefgh';
    component['gender'] = Gender.MALE;
    component['dateOfBirth'] = '2000-01-01';

    component['submitRegister']();

    expect(component['errorMessage']()).toBe(
      'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.',
    );

    expect(
      authService.requestRegisterOtp,
    ).not.toHaveBeenCalled();
  });

  it('should sanitize whitespace from phone number before requesting OTP', () => {
    authService.requestRegisterOtp.and.returnValue(
      of({
        registrationId: 'registration-123',
        expiresIn: 180,
        resendAfter: 180,
        channel: 'sms',
      }),
    );

    component['fullName'] = 'Nguyễn Tùng';
    component['phone'] = '083 841 32 68';
    component['email'] = 'test@example.com';
    component['password'] = 'Password123!';
    component['gender'] = Gender.MALE;
    component['dateOfBirth'] = '2000-01-01';

    component['submitRegister']();

    expect(
      authService.requestRegisterOtp,
    ).toHaveBeenCalledWith({
      fullName: 'Nguyễn Tùng',
      phoneNumber: '0838413268',
      email: 'test@example.com',
      password: 'Password123!',
      gender: Gender.MALE,
      dateOfBirth: '2000-01-01',
    });
  });

  it('should request OTP when registration information is valid', () => {
    authService.requestRegisterOtp.and.returnValue(
      of({
        registrationId: 'registration-123',
        expiresIn: 180,
        resendAfter: 180,
        channel: 'sms',
      }),
    );

    component['fullName'] = ' Nguyễn Tùng ';
    component['phone'] = ' 0838413268 ';
    component['email'] = ' test@example.com ';
    component['password'] = 'Password123!';
    component['gender'] = Gender.MALE;
    component['dateOfBirth'] = '2000-01-01';

    component['submitRegister']();

    expect(
      authService.requestRegisterOtp,
    ).toHaveBeenCalledWith({
      fullName: 'Nguyễn Tùng',
      phoneNumber: '0838413268',
      email: 'test@example.com',
      password: 'Password123!',
      gender: Gender.MALE,
      dateOfBirth: '2000-01-01',
    });

    expect(component['registrationId']).toBe(
      'registration-123',
    );

    expect(component['step']()).toBe(2);
    expect(component['loading']()).toBe(false);
    expect(component['resendCountdown']()).toBe(180);
  });

  it('should show backend error when requesting OTP fails', () => {
    authService.requestRegisterOtp.and.returnValue(
      throwError(() => ({
        error: {
          message: 'Email đã được sử dụng.',
        },
      })),
    );

    component['fullName'] = 'Nguyễn Tùng';
    component['phone'] = '0838413268';
    component['email'] = 'test@example.com';
    component['password'] = 'Password123!';
    component['gender'] = Gender.MALE;
    component['dateOfBirth'] = '2000-01-01';

    component['submitRegister']();

    expect(component['loading']()).toBe(false);

    expect(component['errorMessage']()).toBe(
      'Email đã được sử dụng.',
    );
  });

  it('should accept only one numeric OTP digit per input', () => {
    const event = {
      target: {
        value: 'abc7',
      },
    } as unknown as Event;

    component['onOtpInput'](event, 0);

    expect(component['otpDigits']()).toEqual([
      '7',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('should distribute pasted OTP into six digits', () => {
    const preventDefault = jasmine.createSpy(
      'preventDefault',
    );

    const clipboardEvent = {
      preventDefault,
      clipboardData: {
        getData: () => '12a34567',
      },
    } as unknown as ClipboardEvent;

    component['onOtpPaste'](clipboardEvent);

    expect(preventDefault).toHaveBeenCalled();

    expect(component['otpDigits']()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
  });

  it('should reject OTP verification when fewer than six digits are entered', () => {
    component['otpDigits'].set([
      '1',
      '2',
      '3',
      '',
      '',
      '',
    ]);

    component['verifyOtp']();

    expect(component['errorMessage']()).toBe(
      'Vui lòng nhập đủ 6 số OTP.',
    );

    expect(
      authService.verifyRegisterOtp,
    ).not.toHaveBeenCalled();
  });

  it('should reject OTP verification when registration ID is missing', () => {
    component['otpDigits'].set([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);

    component['verifyOtp']();

    expect(component['errorMessage']()).toBe(
      'Phiên đăng ký không hợp lệ. Vui lòng đăng ký lại.',
    );

    expect(
      authService.verifyRegisterOtp,
    ).not.toHaveBeenCalled();
  });

  it('should verify OTP and navigate to patient dashboard', () => {
    authService.verifyRegisterOtp.and.returnValue(
      of({
        userId: 'user-123',
        phrId: 'phr-123',
        status: 'ACTIVE',
        role: Role.PATIENT,
      }),
    );

    component['registrationId'] = 'registration-123';

    component['otpDigits'].set([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);

    component['verifyOtp']();

    expect(
      authService.verifyRegisterOtp,
    ).toHaveBeenCalledWith(
      'registration-123',
      '123456',
    );

    expect(component['loading']()).toBe(false);

    expect(
      router.navigateByUrl,
    ).toHaveBeenCalledWith('/patient');
  });

  it('should show backend error when OTP verification fails', () => {
    authService.verifyRegisterOtp.and.returnValue(
      throwError(() => ({
        error: {
          message: 'Mã OTP không hợp lệ.',
        },
      })),
    );

    component['registrationId'] = 'registration-123';

    component['otpDigits'].set([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);

    component['verifyOtp']();

    expect(component['loading']()).toBe(false);

    expect(component['errorMessage']()).toBe(
      'Mã OTP không hợp lệ.',
    );
  });

  it('should format countdown correctly', () => {
    expect(
      component['formatCountdown'](180),
    ).toBe('03:00');

    expect(
      component['formatCountdown'](59),
    ).toBe('00:59');

    expect(
      component['formatCountdown'](0),
    ).toBe('00:00');
  });

  it('should return to registration step and clear OTP state', () => {
    component['step'].set(2);
    component['registrationId'] = 'registration-123';

    component['otpDigits'].set([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);

    component['backToRegister']();

    expect(component['step']()).toBe(1);
    expect(component['registrationId']).toBe('');

    expect(component['otpDigits']()).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('should prevent resend OTP while countdown is active', () => {
    component['resendCountdown'].set(100);

    component['resendOtp']();

    expect(
      authService.requestRegisterOtp,
    ).not.toHaveBeenCalled();
  });
});