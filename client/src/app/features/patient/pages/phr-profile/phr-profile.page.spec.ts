import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PhrProfilePage } from './phr-profile.page';
import { Gender } from '@shared/enums';

describe('PhrProfilePage', () => {
  let component: PhrProfilePage;
  let fixture: ComponentFixture<PhrProfilePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhrProfilePage],
    }).compileComponents();

    fixture = TestBed.createComponent(PhrProfilePage);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the PHR form with all expected fields', () => {
    expect(component['form'].fullName).toBe('Nguyễn Tùng');
    expect(component['form'].citizenId).toBe('');
    expect(component['form'].gender).toBe(Gender.MALE);
    expect(component['form'].dateOfBirth).toBe('1992-08-12');
    expect(component['form'].address).toBe('');
    expect(component['form'].healthInsurance).toBe(
      'DN 4 01 234567890',
    );
    expect(component['form'].bloodType).toBe('O+');
    expect(component['form'].drugAllergy).toBe('Penicillin');
    expect(component['form'].chronicDiseases).toBe(
      'Hen phế quản',
    );
    expect(component['form'].surgeryHistory).toBe(
      'Không có',
    );
  });

  it('should use the shared Gender enum', () => {
    expect(component['form'].gender).toBe(Gender.MALE);

    component['form'].gender = Gender.FEMALE;

    expect(component['form'].gender).toBe(Gender.FEMALE);
  });

  it('should mark the form as saved when saveChanges is called', () => {
    component['saveChanges']();

    expect(component['isSaved']).toBeTrue();
  });

  it('should restore the initial form and clear saved state when cancelChanges is called', () => {
    component['form'].fullName = 'Changed Name';
    component['form'].citizenId = '123456789';
    component['form'].gender = Gender.FEMALE;
    component['form'].dateOfBirth = '2000-01-01';
    component['form'].address = 'Changed address';
    component['form'].bloodType = 'A+';

    component['isSaved'] = true;

    component['cancelChanges']();

    expect(component['form'].fullName).toBe('Nguyễn Tùng');
    expect(component['form'].citizenId).toBe('');
    expect(component['form'].gender).toBe(Gender.MALE);
    expect(component['form'].dateOfBirth).toBe('1992-08-12');
    expect(component['form'].address).toBe('');
    expect(component['form'].healthInsurance).toBe(
      'DN 4 01 234567890',
    );
    expect(component['form'].bloodType).toBe('O+');
    expect(component['form'].drugAllergy).toBe('Penicillin');
    expect(component['form'].chronicDiseases).toBe(
      'Hen phế quản',
    );
    expect(component['form'].surgeryHistory).toBe(
      'Không có',
    );
    expect(component['isSaved']).toBeFalse();
  });
});