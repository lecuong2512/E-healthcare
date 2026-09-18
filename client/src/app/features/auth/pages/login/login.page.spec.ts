import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  RouterLink,
} from '@angular/router';
import { of, throwError } from 'rxjs';

import { LoginPage } from './login.page';
import { AuthService } from '../../../../core/services/auth.service';
import { TokenStoreService } from '../../../../core/services/token-store.service';
import { Role } from '@shared/enums/role.enum';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;

  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let tokenStore: TokenStoreService;
  let userRoleSignal: ReturnType<typeof signal<string | null>>;

  function createActivatedRoute(googleParam: string | null) {
    return {
      snapshot: {
        queryParamMap: {
          get: () => googleParam,
        },
      },
    };
  }

  function createTokenStore() {
    userRoleSignal = signal<string | null>(null);

    return {
      accessToken: signal<string | null>(null),
      userRole: userRoleSignal,
      setSession: jasmine.createSpy('setSession'),
      clear: jasmine.createSpy('clear'),
      isAuthenticated: jasmine
        .createSpy('isAuthenticated')
        .and.returnValue(false),
    } as unknown as TokenStoreService;
  }

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>(
      'AuthService',
      ['login'],
    );

    router = jasmine.createSpyObj<Router>(
      'Router',
      ['navigateByUrl'],
    );

    tokenStore = createTokenStore();

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      schemas: [NO_ERRORS_SCHEMA],
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
          provide: TokenStoreService,
          useValue: tokenStore,
        },
        {
          provide: ActivatedRoute,
          useValue: createActivatedRoute(null),
        },
      ],
    })
      .overrideComponent(LoginPage, {
        remove: {
          imports: [RouterLink],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty login state', () => {
    expect(component.identifier).toBe('');
    expect(component.password).toBe('');
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
    expect(component.showPassword()).toBe(false);
  });

  it('should call AuthService.login with identifier and password', () => {
    authService.login.and.returnValue(
      of({
        accessToken: 'access-token',
        role: Role.PATIENT,
      }),
    );

    component.identifier = '0838413268';
    component.password = 'Password123!';

    component.submit();

    expect(authService.login).toHaveBeenCalledWith(
      '0838413268',
      'Password123!',
    );
  });

  it('should navigate to patient dashboard after successful login', () => {
    authService.login.and.returnValue(
      of({
        accessToken: 'access-token',
        role: Role.PATIENT,
      }),
    );

    component.submit();

    expect(component.loading()).toBe(false);

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/patient',
    );

    expect(component.errorMessage()).toBeNull();
  });

  it('should navigate to doctor dashboard after successful login', () => {
    authService.login.and.returnValue(
      of({
        accessToken: 'access-token',
        role: Role.DOCTOR,
      }),
    );

    component.submit();

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/doctor',
    );
  });

  it('should show authentication error for HTTP 401', () => {
    authService.login.and.returnValue(
      throwError(() => ({
        status: 401,
      })),
    );

    component.submit();

    expect(component.loading()).toBe(false);

    expect(component.errorMessage()).toBe(
      'Tài khoản hoặc mật khẩu không chính xác.',
    );
  });

  it('should show locked-account message for LOGIN_LOCKED 429', () => {
    authService.login.and.returnValue(
      throwError(() => ({
        status: 429,
        error: {
          code: 'LOGIN_LOCKED',
          retryAfter: 1800,
        },
      })),
    );

    component.submit();

    expect(component.loading()).toBe(false);

    expect(component.errorMessage()).toBe(
      'Tài khoản tạm khóa. Vui lòng chờ 30 phút rồi thử lại.',
    );
  });

  it('should round up remaining lock time', () => {
    authService.login.and.returnValue(
      throwError(() => ({
        status: 429,
        error: {
          code: 'LOGIN_LOCKED',
          retryAfter: 61,
        },
      })),
    );

    component.submit();

    expect(component.errorMessage()).toBe(
      'Tài khoản tạm khóa. Vui lòng chờ 2 phút rồi thử lại.',
    );
  });

  it('should show rate-limit message for other 429 errors', () => {
    authService.login.and.returnValue(
      throwError(() => ({
        status: 429,
        error: {
          code: 'TOO_MANY_REQUESTS',
        },
      })),
    );

    component.submit();

    expect(component.loading()).toBe(false);

    expect(component.errorMessage()).toBe(
      'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 1 phút rồi thử lại.',
    );
  });

  it('should show generic error for unexpected errors', () => {
    authService.login.and.returnValue(
      throwError(() => ({
        status: 500,
      })),
    );

    component.submit();

    expect(component.loading()).toBe(false);

    expect(component.errorMessage()).toBe(
      'Có lỗi xảy ra, vui lòng thử lại sau.',
    );
  });

  it('should clear previous error before submitting', () => {
    component.errorMessage.set('Lỗi cũ');

    authService.login.and.returnValue(
      of({
        accessToken: 'access-token',
        role: Role.PATIENT,
      }),
    );

    component.submit();

    expect(component.errorMessage()).toBeNull();
  });

  it('should redirect to patient dashboard after Google login callback', async () => {
    userRoleSignal.set(Role.PATIENT);

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      schemas: [NO_ERRORS_SCHEMA],
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
          provide: TokenStoreService,
          useValue: tokenStore,
        },
        {
          provide: ActivatedRoute,
          useValue: createActivatedRoute('success'),
        },
      ],
    })
      .overrideComponent(LoginPage, {
        remove: {
          imports: [RouterLink],
        },
      })
      .compileComponents();

    const googleFixture =
      TestBed.createComponent(LoginPage);

    googleFixture.detectChanges();

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/patient',
    );

    googleFixture.destroy();
  });

  it('should show error when Google callback has no role', async () => {
    userRoleSignal.set(null);

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      schemas: [NO_ERRORS_SCHEMA],
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
          provide: TokenStoreService,
          useValue: tokenStore,
        },
        {
          provide: ActivatedRoute,
          useValue: createActivatedRoute('success'),
        },
      ],
    })
      .overrideComponent(LoginPage, {
        remove: {
          imports: [RouterLink],
        },
      })
      .compileComponents();

    const googleFixture =
      TestBed.createComponent(LoginPage);

    const googleComponent =
      googleFixture.componentInstance;

    googleFixture.detectChanges();

    expect(
      googleComponent.errorMessage(),
    ).toBe(
      'Không thể phục hồi phiên Google. Vui lòng thử lại trên HTTPS.',
    );

    expect(router.navigateByUrl).not.toHaveBeenCalled();

    googleFixture.destroy();
  });
});