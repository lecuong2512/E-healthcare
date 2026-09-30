import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StaffMgmtPage } from './staff-mgmt.page';
import { AdminStaffApiService } from '../../data-access/admin-staff-api.service';
import { Role } from '@shared/enums';

describe('StaffMgmtPage', () => {
  it('shows the three management summary cards from the reference layout', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 186, pending: 8, blocked: 3 } })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.cards article') as NodeListOf<HTMLElement>;
    expect(fixture.nativeElement.querySelector('h1')?.textContent?.trim()).toBe('Quản lý tài khoản nhân sự');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('Nhân sự');
    expect(cards[1].textContent).toContain('Phòng/Buồng khám');
    expect(cards[2].textContent).toContain('Ca trực chờ duyệt');
  });

  it('keeps a small gap between the staff filters', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    const filters = fixture.nativeElement.querySelector('.filters') as HTMLElement;

    expect(getComputedStyle(filters).columnGap).toBe('8px');
  });

  it('labels and separates the staff actions', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({
        data: [{ id: 'staff-1', fullName: 'Nguyễn An', email: 'an@example.test', status: 'ACTIVE', role: Role.DOCTOR }],
        summary: { active: 1, pending: 0, blocked: 0 },
      })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    const actionHeading = fixture.nativeElement.querySelector('thead th:last-child') as HTMLElement;
    const actions = fixture.nativeElement.querySelector('tbody .actions') as HTMLElement;
    const roleCell = fixture.nativeElement.querySelector('tbody td:nth-child(3)') as HTMLElement;

    expect(actionHeading.textContent?.trim()).toBe('Hành động');
    expect(roleCell.textContent?.trim()).toBe('Bác sĩ');
    expect(actions).not.toBeNull();
    if (actions) expect(getComputedStyle(actions).columnGap).toBe('12px');
  });

  it('renders section titles with a strong clinical-blue treatment', () => {
    const api = { listRecurringShifts: jasmine.createSpy().and.returnValue(of([])), listSpecialties: jasmine.createSpy().and.returnValue(of([])), list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.table-card h2') as HTMLElement;
    expect(getComputedStyle(title).fontWeight).toBe('700');
    expect(getComputedStyle(title).color).toBe('rgb(15, 76, 129)');
  });

  it('submits the new staff form and refreshes the staff list', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })),
      create: jasmine.createSpy().and.returnValue(of({ id: 'new-id', fullName: 'BS Nguyễn An', email: 'an@example.test', status: 'ACTIVE' })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.staffForm.patchValue({
      fullName: 'BS Nguyễn An', email: 'an@example.test', password: 'Secret!123', role: 'ROLE_DOCTOR',
      gender: 'MALE', dateOfBirth: '1980-01-01', specialtyId: 'specialty-1, specialty-2', licenseNumber: 'CCHN-01', roomNumber: 'P.201', yearsExperience: 5,
    });
    component.createStaff();

    expect(api.create).toHaveBeenCalledWith(jasmine.objectContaining({ specialtyIds: ['specialty-1', 'specialty-2'], yearsExperience: 5 }));
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('shows shared user fields for a receptionist without doctor-only fields', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])), listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();
    fixture.componentInstance.openForm();
    fixture.componentInstance.staffForm.controls.role.setValue(Role.RECEPTIONIST);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[formControlName="phoneNumber"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[formControlName="licenseNumber"]')).toBeNull();
  });

  it('keeps the form primary action visibly blue in the footer', () => {
    const api = { listRecurringShifts: jasmine.createSpy().and.returnValue(of([])), listSpecialties: jasmine.createSpy().and.returnValue(of([])), list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.componentInstance.openForm();
    fixture.detectChanges();

    const action = fixture.nativeElement.querySelector('footer .primary') as HTMLButtonElement;
    expect(action.textContent?.trim()).toBe('Tạo tài khoản');
    expect(getComputedStyle(action).backgroundColor).toBe('rgb(7, 141, 204)');
  });

  it('filters staff by search text and role', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({
        data: [
          { id: 'doctor-1', fullName: 'Nguyễn An', email: 'an@example.test', status: 'ACTIVE', role: Role.DOCTOR },
          { id: 'admin-1', fullName: 'Trần Bình', email: 'binh@example.test', status: 'ACTIVE', role: Role.ADMIN },
        ],
        summary: { active: 2, pending: 0, blocked: 0 },
      })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('[data-testid="staff-search"]') as HTMLInputElement;
    search.value = 'NV-00002';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const staffBody = fixture.nativeElement.querySelector('.table-card tbody') as HTMLElement;
    expect(staffBody.querySelectorAll('tr').length).toBe(1);
    expect(staffBody.textContent).toContain('Trần Bình');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const role = fixture.nativeElement.querySelector('[data-testid="staff-role"]') as HTMLSelectElement;
    role.value = Role.DOCTOR;
    role.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Nguyễn An');
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('Trần Bình');
  });

  it('shows at most ten staff rows per page and moves to the next page', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({
        data: Array.from({ length: 11 }, (_, index) => ({ id: `staff-${index}`, fullName: `Nhân sự ${index + 1}`, email: `staff${index + 1}@example.test`, status: 'ACTIVE', role: Role.ADMIN })),
        summary: { active: 11, pending: 0, blocked: 0 },
      })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('[data-testid="staff-row"]').length).toBe(10);
    (fixture.nativeElement.querySelector('[data-testid="staff-next-page"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="staff-row"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-testid="staff-pagination"]')?.textContent).toContain('2 / 2');
  });

  it('shows detail and edit actions for each clinic room', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([])),
      list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })),
      listRoomCatalog: jasmine.createSpy().and.returnValue(of([{ id: 'room-1', roomNumber: 'P001', roomName: 'Phòng khám nội', isActive: true }])),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.componentInstance.activeTab.set('rooms');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('thead th:last-child')?.textContent?.trim()).toBe('Hành động');
    expect(fixture.nativeElement.querySelector('[data-testid="room-details"]')?.textContent?.trim()).toBe('Xem chi tiết');
    expect(fixture.nativeElement.querySelector('[data-testid="room-edit"]')?.textContent?.trim()).toBe('Chỉnh sửa');
  });

  it('opens doctor details and saves room plus multiple specialties', () => {
    const api = {
      listRecurringShifts: jasmine.createSpy().and.returnValue(of([])),
      listRooms: jasmine.createSpy().and.returnValue(of(['P.201', 'B.305'])),
      listSpecialties: jasmine.createSpy().and.returnValue(of([
        { id: 'sp-1', name: 'Tim mạch' },
        { id: 'sp-2', name: 'Nội tổng quát' },
      ])),
      list: jasmine.createSpy().and.returnValue(of({
        data: [{ id: 'doctor-1', fullName: 'Nguyễn An', email: 'an@example.test', status: 'ACTIVE', role: Role.DOCTOR, dateOfBirth: '1980-01-01', licenseNumber: 'CCHN-01', academicTitle: 'ThS.BS', yearsExperience: 7, roomNumber: 'P.201', specialtyIds: ['sp-1'] }],
        summary: { active: 1, pending: 0, blocked: 0 },
      })),
      updateProfile: jasmine.createSpy().and.returnValue(of({})),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    fixture.detectChanges();

    const detail = Array.from(fixture.nativeElement.querySelectorAll('.row-action') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Xem chi tiết');
    detail?.click();
    fixture.detectChanges();

    const room = fixture.nativeElement.querySelector('[formControlName="roomNumber"]') as HTMLInputElement;
    room.value = 'B.305';
    room.dispatchEvent(new Event('change'));
    const specialtyCheckboxes = fixture.nativeElement.querySelectorAll('[data-testid="specialty-option"]') as NodeListOf<HTMLInputElement>;
    specialtyCheckboxes[1].click();
    fixture.detectChanges();
    const save = fixture.nativeElement.querySelector('[data-testid="save-details"]') as HTMLButtonElement;
    save.click();

    expect(api.updateProfile).toHaveBeenCalledWith('doctor-1', jasmine.objectContaining({
      roomNumber: 'B.305', specialtyIds: ['sp-1', 'sp-2'],
    }));
  });
});
