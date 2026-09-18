import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PhrProfilePage } from './phr-profile.page';
import { PhrService } from '../../../../core/services/phr.service';
import { Gender } from '@shared/enums';
import { PhrProfile } from '@shared/interfaces';
import { of } from 'rxjs';

describe('PhrProfilePage', () => {
  let component: PhrProfilePage;
  let fixture: ComponentFixture<PhrProfilePage>;
  let phrService: jasmine.SpyObj<PhrService>;

  const mockProfile: PhrProfile = {
    fullName: 'Nguyễn Tùng',
    citizenId: '',
    gender: Gender.MALE,
    dateOfBirth: '1992-08-12',
    address: '',
    healthInsurance: 'DN 4 01 234567890',
    bloodType: 'O+',
    allergies: 'Penicillin',
    chronicDiseases: 'Hen phế quản',
    surgeryHistory: 'Không có',
  };

  beforeEach(async () => {
    phrService = jasmine.createSpyObj<PhrService>('PhrService', [
      'getMyPhr',
      'updateMyPhr',
    ]);

    phrService.getMyPhr.and.returnValue(of(mockProfile));
    phrService.updateMyPhr.and.returnValue(of(mockProfile));

    await TestBed.configureTestingModule({
      imports: [PhrProfilePage],
      providers: [
        {
          provide: PhrService,
          useValue: phrService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PhrProfilePage);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load the PHR profile from PhrService', () => {
    expect(phrService.getMyPhr).toHaveBeenCalled();

    expect(component['form']).toEqual(mockProfile);
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
    expect(component['form'].allergies).toBe('Penicillin');
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

  it('should update the PHR profile when saveChanges is called', () => {
    component['form'].fullName = 'Changed Name';
    component['form'].citizenId = '123456789';
    component['form'].gender = Gender.FEMALE;
    component['form'].dateOfBirth = '2000-01-01';
    component['form'].address = 'Changed address';
    component['form'].healthInsurance = 'DN 4 99 999999999';
    component['form'].bloodType = 'A+';
    component['form'].allergies = 'Penicillin';
    component['form'].chronicDiseases = 'Hen phế quản';
    component['form'].surgeryHistory = 'Không có';

    component['saveChanges']();

    expect(phrService.updateMyPhr).toHaveBeenCalledWith({
      fullName: 'Changed Name',
      citizenId: '123456789',
      gender: Gender.FEMALE,
      dateOfBirth: '2000-01-01',
      address: 'Changed address',
      healthInsurance: 'DN 4 99 999999999',
      bloodType: 'A+',
      allergies: 'Penicillin',
      chronicDiseases: 'Hen phế quản',
      surgeryHistory: 'Không có',
    });

    expect(component['isSaved']).toBeTrue();
    expect(component['isSaving']).toBeFalse();
  });

  it('should trim text fields before sending the update request', () => {
    component['form'].fullName = '  Nguyễn Tùng  ';
    component['form'].citizenId = ' 123456789 ';
    component['form'].address = '  Hà Nội  ';
    component['form'].healthInsurance = ' DN 4 01 234567890 ';
    component['form'].bloodType = 'O+';
    component['form'].allergies = ' Penicillin ';
    component['form'].chronicDiseases = ' Hen phế quản ';
    component['form'].surgeryHistory = ' Không có ';

    component['saveChanges']();

    expect(phrService.updateMyPhr).toHaveBeenCalledWith({
      fullName: 'Nguyễn Tùng',
      citizenId: '123456789',
      gender: Gender.MALE,
      dateOfBirth: '1992-08-12',
      address: 'Hà Nội',
      healthInsurance: 'DN 4 01 234567890',
      bloodType: 'O+',
      allergies: 'Penicillin',
      chronicDiseases: 'Hen phế quản',
      surgeryHistory: 'Không có',
    });
  });

  it('should restore the last saved profile when cancelChanges is called', () => {
    component['form'].fullName = 'Changed Name';
    component['form'].citizenId = '123456789';
    component['form'].gender = Gender.FEMALE;
    component['form'].dateOfBirth = '2000-01-01';
    component['form'].address = 'Changed address';
    component['form'].bloodType = 'A+';
    component['form'].allergies = 'Changed allergy';

    component['isSaved'] = true;

    component['cancelChanges']();

    expect(component['form']).toEqual(mockProfile);
    expect(component['isSaved']).toBeFalse();
    expect(component['errorMessage']).toBe('');
  });
});