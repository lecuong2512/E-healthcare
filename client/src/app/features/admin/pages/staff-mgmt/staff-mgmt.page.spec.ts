import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StaffMgmtPage } from './staff-mgmt.page';
import { AdminStaffApiService } from '../../data-access/admin-staff-api.service';

describe('StaffMgmtPage', () => {
  it('submits the new staff form and refreshes the staff list', () => {
    const api = {
      list: jasmine.createSpy().and.returnValue(of({ data: [], summary: { active: 0, pending: 0, blocked: 0 } })),
      create: jasmine.createSpy().and.returnValue(of({ id: 'new-id', fullName: 'BS Nguyễn An', email: 'an@example.test', status: 'ACTIVE' })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminStaffApiService, useValue: api }] });
    const fixture = TestBed.createComponent(StaffMgmtPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.staffForm.patchValue({
      fullName: 'BS Nguyễn An', email: 'an@example.test', password: 'Secret!123', role: 'ROLE_DOCTOR',
      gender: 'MALE', dateOfBirth: '1980-01-01', specialtyId: 'specialty-1', licenseNumber: 'CCHN-01', roomNumber: 'P.201',
    });
    component.createStaff();

    expect(api.create).toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
