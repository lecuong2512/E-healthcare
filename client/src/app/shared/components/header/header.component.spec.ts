import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NavbarComponent, getInitials, DEFAULT_USERS, ROLE_CONFIG } from './header.component';
import { AuthService } from '../../../core/services/auth.service';
import { TokenStoreService } from '../../../core/services/token-store.service';
import { Role } from '@shared/enums';

describe('NavbarComponent', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let component: NavbarComponent;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let tokenStore: TokenStoreService;
  let router: Router;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', ['logout']);
    authServiceSpy.logout.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    tokenStore = TestBed.inject(TokenStoreService);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    tokenStore.clear();
    localStorage.clear();
  });

  describe('getInitials helper', () => {
    it('returns initials for 2-word names correctly', () => {
      expect(getInitials('Nguyễn An')).toBe('NA');
      expect(getInitials('Trần Bình')).toBe('TB');
      expect(getInitials('Lê Cường')).toBe('LC');
      expect(getInitials('Phạm Dũng')).toBe('PD');
    });

    it('returns initials for 3+ word names using first and last word', () => {
      expect(getInitials('Nguyễn Văn An')).toBe('NA');
      expect(getInitials('Lê Thị Diễm Cường')).toBe('LC');
      expect(getInitials('Trần Quốc Bình')).toBe('TB');
    });

    it('handles single word or empty input gracefully', () => {
      expect(getInitials('Admin')).toBe('AD');
      expect(getInitials('')).toBe('EH');
    });
  });

  describe('Unauthenticated state', () => {
    it('renders login link when user is not authenticated', () => {
      tokenStore.clear();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const loginBtn = el.querySelector('a[routerLink="/login"]');
      expect(loginBtn).not.toBeNull();
      expect(loginBtn?.textContent?.trim()).toContain('Đăng nhập');
    });
  });

  describe('Role-based navigation', () => {
    it('renders Patient navigation links for PATIENT role', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Tìm bác sĩ');
      expect(text).toContain('Lịch sử khám & Đơn thuốc');
      expect(text).toContain('Hồ sơ sức khỏe');
    });

    it('renders Doctor navigation links for DOCTOR role', () => {
      tokenStore.setSession('fake-token', Role.DOCTOR);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Hàng đợi khám');
      expect(text).toContain('Lịch khám & Ca trực');
    });

    it('renders Receptionist navigation links for RECEPTIONIST role', () => {
      tokenStore.setSession('fake-token', Role.RECEPTIONIST);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Tiếp đón check-in');
      expect(text).toContain('Đặt lịch vãng lai');
      expect(text).toContain('Bảng gọi số Smart TV');
    });

    it('renders Admin navigation links for ADMIN role', () => {
      tokenStore.setSession('fake-token', Role.ADMIN);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Dashboard KPI');
      expect(text).toContain('Danh mục y tế');
      expect(text).toContain('Quản lý nhân sự');
      expect(text).toContain('Nhật ký kiểm toán');
    });
  });

  describe('User Avatar and Dropdown Menu', () => {
    it('displays initials and full name corresponding to role defaults', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      fixture.detectChanges();

      expect(component.userInitials()).toBe('NA');
      expect(component.currentUser().fullName).toBe('Nguyễn An');

      tokenStore.setSession('fake-token', Role.DOCTOR);
      fixture.detectChanges();
      expect(component.userInitials()).toBe('TB');

      tokenStore.setSession('fake-token', Role.RECEPTIONIST);
      fixture.detectChanges();
      expect(component.userInitials()).toBe('LC');

      tokenStore.setSession('fake-token', Role.ADMIN);
      fixture.detectChanges();
      expect(component.userInitials()).toBe('PD');
    });

    it('displays custom user profile when set in tokenStore', () => {
      tokenStore.setSession('fake-token', Role.PATIENT, {
        fullName: 'Phạm Minh Tuấn',
        email: 'tuanpm@example.com',
        phoneNumber: '0909999999',
        role: Role.PATIENT,
      });
      fixture.detectChanges();

      expect(component.userInitials()).toBe('PT');
      expect(component.currentUser().fullName).toBe('Phạm Minh Tuấn');
      expect(component.currentUser().email).toBe('tuanpm@example.com');
    });

    it('displays avatar image when avatarUrl is provided in user profile', () => {
      tokenStore.setSession('fake-token', Role.PATIENT, {
        fullName: 'Phạm Minh Tuấn',
        email: 'tuanpm@example.com',
        phoneNumber: '0909999999',
        role: Role.PATIENT,
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const avatarImg = el.querySelector('button img[alt="Phạm Minh Tuấn"]');
      expect(avatarImg).not.toBeNull();
      expect(avatarImg?.getAttribute('src')).toBe('https://example.com/avatar.jpg');
    });

    it('opens and closes dropdown menu when avatar button is clicked', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      fixture.detectChanges();

      expect(component.isUserMenuOpen()).toBeFalse();

      component.toggleUserMenu();
      fixture.detectChanges();
      expect(component.isUserMenuOpen()).toBeTrue();

      const dropdown = fixture.nativeElement.querySelector('[role="menu"]');
      expect(dropdown).not.toBeNull();
      expect(dropdown.textContent).toContain('Nguyễn An');
      expect(dropdown.textContent).toContain('Bệnh nhân');

      component.closeUserMenu();
      fixture.detectChanges();
      expect(component.isUserMenuOpen()).toBeFalse();
    });

    it('closes menu when Escape key is pressed', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      component.isUserMenuOpen.set(true);
      fixture.detectChanges();

      component.onEscape();
      expect(component.isUserMenuOpen()).toBeFalse();
    });

    it('shows PHR and Medical History links in dropdown for PATIENT', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      component.isUserMenuOpen.set(true);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const menu = el.querySelector('[role="menu"]') as HTMLElement;
      expect(menu).not.toBeNull();

      const phrLink = menu.querySelector('a[routerLink="/patient/profile"]');
      const historyLink = menu.querySelector('a[routerLink="/patient/history"]');

      expect(phrLink).not.toBeNull();
      expect(phrLink?.textContent).toContain('Hồ sơ sức khỏe cá nhân (PHR)');
      expect(historyLink).not.toBeNull();
      expect(historyLink?.textContent).toContain('Lịch sử khám bệnh');
    });

    it('does not show PHR links in dropdown for DOCTOR or ADMIN', () => {
      tokenStore.setSession('fake-token', Role.DOCTOR);
      component.isUserMenuOpen.set(true);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const menu = el.querySelector('[role="menu"]') as HTMLElement;
      expect(menu).not.toBeNull();

      const phrLink = menu.querySelector('a[routerLink="/patient/profile"]');
      expect(phrLink).toBeNull();
    });

    it('calls authService.logout, clears store and navigates to /login on logout', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      component.isUserMenuOpen.set(true);
      fixture.detectChanges();

      component.logout();

      expect(authServiceSpy.logout).toHaveBeenCalled();
      expect(tokenStore.isAuthenticated()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
      expect(component.isUserMenuOpen()).toBeFalse();
    });

    it('clears store and navigates to /login even if authService.logout errors', () => {
      authServiceSpy.logout.and.returnValue(throwError(() => new Error('Network error')));
      tokenStore.setSession('fake-token', Role.PATIENT);
      component.isUserMenuOpen.set(true);
      fixture.detectChanges();

      component.logout();

      expect(authServiceSpy.logout).toHaveBeenCalled();
      expect(tokenStore.isAuthenticated()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });
  });

  describe('Brand Logo and homeRoute', () => {
    it('computes homeRoute based on user role', () => {
      tokenStore.clear();
      expect(component.homeRoute()).toBe('/login');

      tokenStore.setSession('fake-token', Role.PATIENT);
      expect(component.homeRoute()).toBe('/patient/doctor-search');

      tokenStore.setSession('fake-token', Role.DOCTOR);
      expect(component.homeRoute()).toBe('/doctor/queue');

      tokenStore.setSession('fake-token', Role.RECEPTIONIST);
      expect(component.homeRoute()).toBe('/receptionist/checkin');

      tokenStore.setSession('fake-token', Role.ADMIN);
      expect(component.homeRoute()).toBe('/admin/dashboard');
    });

    it('binds brand logo anchor to homeRoute', () => {
      tokenStore.setSession('fake-token', Role.PATIENT);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const logoLink = el.querySelector('a[aria-label="Trang chủ E-Healthcare"]');
      expect(logoLink).not.toBeNull();
      expect(logoLink?.getAttribute('href')).toBe('/patient/doctor-search');
    });
  });
});
