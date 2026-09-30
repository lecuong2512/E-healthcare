import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { NavbarComponent } from './header.component';
import { AuthService } from '../../../core/services/auth.service';
import { Role } from '@shared/enums';

describe('NavbarComponent (Role-based Navigation)', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let mockUserRole: ReturnType<typeof signal<string | null>>;

  beforeEach(async () => {
    mockUserRole = signal<string | null>(null);

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            userRole: mockUserRole,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the navbar component', () => {
    expect(component).toBeTruthy();
  });

  it('should render patient menu items when role is ROLE_PATIENT', () => {
    mockUserRole.set(Role.PATIENT);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav a')).map((a) =>
      a.textContent?.trim(),
    );

    expect(links).toEqual(['Tìm bác sĩ', 'Lịch sử khám', 'Hồ sơ sức khỏe']);
    expect(component.homeRoute()).toBe('/patient/doctor-search');
  });

  it('should render doctor menu items when role is ROLE_DOCTOR', () => {
    mockUserRole.set(Role.DOCTOR);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav a')).map((a) =>
      a.textContent?.trim(),
    );

    expect(links).toEqual(['Hàng đợi khám', 'Cấu hình ca trực']);
    expect(component.homeRoute()).toBe('/doctor/queue');
  });

  it('should render receptionist menu items when role is ROLE_RECEPTIONIST', () => {
    mockUserRole.set(Role.RECEPTIONIST);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav a')).map((a) =>
      a.textContent?.trim(),
    );

    expect(links).toEqual(['Bàn tiếp đón check-in', 'Tiếp nhận vãng lai']);
    expect(component.homeRoute()).toBe('/receptionist/checkin');
  });

  it('should render admin menu items when role is ROLE_ADMIN', () => {
    mockUserRole.set(Role.ADMIN);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav a')).map((a) =>
      a.textContent?.trim(),
    );

    expect(links).toEqual([
      'Dashboard KPI',
      'Danh mục y tế',
      'Nhân sự',
      'Nhật ký kiểm toán',
    ]);
    expect(component.homeRoute()).toBe('/admin/dashboard');
  });

  it('should render empty navigation links when not logged in', () => {
    mockUserRole.set(null);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav a'));

    expect(links.length).toBe(0);
    expect(component.homeRoute()).toBe('/');
  });
});
