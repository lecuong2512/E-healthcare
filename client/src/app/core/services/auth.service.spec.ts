import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { TokenStoreService } from './token-store.service';
import { SocketService } from './socket.service';
import { CurrentUser, LoginResponse, RefreshResponse } from '@shared/interfaces';
import { Gender, Role } from '@shared/enums';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let tokenStore: TokenStoreService;
  let socketServiceSpy: jasmine.SpyObj<SocketService>;

  const mockUser: CurrentUser = {
    id: 'user-001',
    fullName: 'Nguyễn Văn Thật',
    email: 'thatnguyen@example.com',
    phoneNumber: '0901112233',
    role: Role.PATIENT,
  };

  beforeEach(() => {
    socketServiceSpy = jasmine.createSpyObj<SocketService>('SocketService', ['disconnect']);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        TokenStoreService,
        { provide: SocketService, useValue: socketServiceSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStore = TestBed.inject(TokenStoreService);
  });

  afterEach(() => {
    httpMock.verify();
    tokenStore.clear();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('login() should pass res.user to tokenStore.setSession', () => {
    const mockResponse: LoginResponse = {
      accessToken: 'token-abc',
      role: Role.PATIENT,
      user: mockUser,
    };

    service.login('thatnguyen@example.com', 'Password123!').subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);

    expect(tokenStore.accessToken()).toBe('token-abc');
    expect(tokenStore.userRole()).toBe(Role.PATIENT);
    expect(tokenStore.currentUser()).toEqual(mockUser);
  });

  it('refreshToken() should pass res.user to tokenStore.setSession', () => {
    const mockResponse: RefreshResponse = {
      accessToken: 'token-refreshed',
      role: Role.PATIENT,
      user: mockUser,
    };

    service.refreshToken().subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/v1/auth/refresh');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);

    expect(tokenStore.accessToken()).toBe('token-refreshed');
    expect(tokenStore.userRole()).toBe(Role.PATIENT);
    expect(tokenStore.currentUser()).toEqual(mockUser);
  });

  it('completeGoogleRegistration() should pass res.user to tokenStore.setSession', () => {
    const mockResponse: LoginResponse = {
      accessToken: 'token-google',
      role: Role.PATIENT,
      user: mockUser,
    };

    service
      .completeGoogleRegistration({
        fullName: 'Nguyễn Văn Thật',
        gender: Gender.MALE,
        dateOfBirth: '1995-05-15',
      })
      .subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

    const req = httpMock.expectOne('/api/v1/auth/google/complete');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);

    expect(tokenStore.accessToken()).toBe('token-google');
    expect(tokenStore.userRole()).toBe(Role.PATIENT);
    expect(tokenStore.currentUser()).toEqual(mockUser);
  });

  it('fetchProfile() should call GET /api/v1/auth/me and update tokenStore.currentUser', () => {
    tokenStore.setSession('token-123', Role.PATIENT, {
      fullName: 'Init Name',
      role: Role.PATIENT,
    });

    service.fetchProfile().subscribe((profile) => {
      expect(profile).toBeTruthy();
    });

    const req = httpMock.expectOne('/api/v1/auth/profile');
    expect(req.request.method).toBe('GET');
    req.flush({
      userId: 'user-001',
      role: Role.PATIENT,
      fullName: 'Hồ Sơ Cập Nhật',
      email: 'updated@example.com',
    });

    expect(tokenStore.currentUser()?.fullName).toBe('Hồ Sơ Cập Nhật');
    expect(tokenStore.currentUser()?.email).toBe('updated@example.com');
  });
});
