import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ConsultationPage } from './consultation.page';
import { PhrService } from '../../../../core/services/phr.service';
import { ClinicalService } from '../../../../core/services/clinical.service';
import { Gender } from '@shared/enums';
import { PhrProfile, MedicalRecordDetailResponse, EmrHistoryResponse, EmrAddendumData } from '@shared/interfaces';

describe('ConsultationPage (SRS-DOC-03, SRS-DOC-04 & Section 5.4)', () => {
  let component: ConsultationPage;
  let fixture: ComponentFixture<ConsultationPage>;
  let phrService: jasmine.SpyObj<PhrService>;
  let clinicalService: jasmine.SpyObj<ClinicalService>;

  const mockPhr: PhrProfile = {
    fullName: 'Nguyễn Văn Bệnh Nhân',
    citizenId: '001200000000',
    gender: Gender.MALE,
    address: 'Hà Nội',
    healthInsurance: 'DN 4 01 234567890',
    dateOfBirth: '1990-05-15',
    bloodType: 'A+',
    allergies: 'Penicillin, Aspirin',
    chronicDiseases: 'Hen phế quản',
    surgeryHistory: 'Chưa phẫu thuật',
  };

  const mockRecord = {
    id: 'rec-123',
    appointmentId: 'app-123',
    patientId: 'pat-123',
    doctorId: 'doc-123',
    clinicalNotes: 'Ghi chú ban đầu',
    doctorAdvice: 'Uống thuốc đúng giờ',
    followUpDate: '2026-10-15',
    isLocked: false,
    lockedAt: null,
    completedAt: null,
  } as unknown as MedicalRecordDetailResponse;

  const mockHistory = {
    recordId: 'rec-123',
    appointmentId: 'app-123',
    patientId: 'pat-123',
    doctorId: 'doc-123',
    isLocked: false,
    lockedAt: null,
    completedAt: null,
    originalSnapshot: {
      clinicalNotes: 'Ghi chú ban đầu',
      doctorAdvice: 'Uống thuốc đúng giờ',
      followUpDate: '2026-10-15',
      icd10PrimaryCode: 'J45.9',
      icd10SecondaryCodes: null,
      vitalSigns: null,
    },
    addendums: [],
  } as unknown as EmrHistoryResponse;

  beforeEach(async () => {
    phrService = jasmine.createSpyObj<PhrService>('PhrService', ['getMyPhr']);
    clinicalService = jasmine.createSpyObj<ClinicalService>('ClinicalService', [
      'getMedicalRecordByAppointment',
      'getEmrHistory',
      'createEmrAddendum',
    ]);

    phrService.getMyPhr.and.returnValue(of(mockPhr));
    clinicalService.getMedicalRecordByAppointment.and.returnValue(of(mockRecord));
    clinicalService.getEmrHistory.and.returnValue(of(mockHistory));

    await TestBed.configureTestingModule({
      imports: [ConsultationPage],
      providers: [
        provideRouter([]),
        { provide: PhrService, useValue: phrService },
        { provide: ClinicalService, useValue: clinicalService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([['appointmentId', 'app-123']])),
            queryParams: of({ name: 'Nguyễn Văn Bệnh Nhân', gender: 'Nam', year: '1990' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsultationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('TC-UI-CONSULT-01: should create component and load patient PHR profile', () => {
    expect(component).toBeTruthy();
    expect(phrService.getMyPhr).toHaveBeenCalled();
    expect(component.allergies).toBe('Penicillin, Aspirin');
    expect(component.chronicDiseases).toBe('Hen phế quản');
    expect(component.bloodType).toBe('A+');
    expect(component.patientName).toBe('Nguyễn Văn Bệnh Nhân');
  });

  it('TC-UI-CONSULT-02: should calculate BMI correctly and update color indicator', () => {
    component.height = 175;
    component.weight = 70;
    component.calcBmi();

    expect(component.bmi).toBe('22.9');
    expect(component.getBmiColor(component.bmi)).toBe('#22C55E'); // Normal: green

    component.weight = 95;
    component.calcBmi();
    expect(component.getBmiColor(component.bmi)).toBe('#EF4444'); // Obese: red
  });

  it('TC-UI-CONSULT-03: should trigger red allergy modal when prescribing drug in patient allergy group (Amoxicillin -> Penicillin)', () => {
    const amox = component.drugCatalog.find((d) => d.name.includes('Amoxicillin'));
    expect(amox).toBeTruthy();

    component.selectDrug(amox!);
    expect(component.selectedCatalogDrug).toBe(amox!);

    component.tryAddDrug();

    expect(component.showAllergyModal).toBe(true);
    expect(component.pendingDrug).toBe(amox!);
    expect(component.rxList.length).toBe(0);
  });

  it('TC-UI-CONSULT-04: should discard drug when doctor cancels from allergy modal', () => {
    const amox = component.drugCatalog.find((d) => d.name.includes('Amoxicillin'));
    component.selectDrug(amox!);
    component.tryAddDrug();

    component.onModalCancel();

    expect(component.showAllergyModal).toBe(false);
    expect(component.pendingDrug).toBeNull();
    expect(component.rxList.length).toBe(0);
  });

  it('TC-UI-CONSULT-05: should add drug with override reason when doctor confirms override', () => {
    const amox = component.drugCatalog.find((d) => d.name.includes('Amoxicillin'));
    component.selectDrug(amox!);
    component.tryAddDrug();

    component.onModalOverride('Hội chẩn đồng thuận liều thấp kèm theo dõi phản vệ');

    expect(component.showAllergyModal).toBe(false);
    expect(component.pendingDrug).toBeNull();
    expect(component.rxList.length).toBe(1);
    expect(component.rxList[0].drugName).toBe(amox!.name);
  });

  it('TC-UI-CONSULT-06: should add drug directly without modal when drug does not match allergy (Paracetamol)', () => {
    const parac = component.drugCatalog.find((d) => d.name.includes('Paracetamol'));
    expect(parac).toBeTruthy();

    component.selectDrug(parac!);
    component.tryAddDrug();

    expect(component.showAllergyModal).toBe(false);
    expect(component.rxList.length).toBe(1);
    expect(component.rxList[0].drugName).toBe(parac!.name);
  });

  it('TC-UI-CONSULT-07: should identify chronic patient and warn when prescription exceeds 30 days (Circular 52/2017/TT-BYT)', () => {
    expect(component.isChronicPatient).toBe(true);

    const parac = component.drugCatalog.find((d) => d.name.includes('Paracetamol'));
    component.addDrugDirectly(parac!);

    const rx = component.rxList[0];
    rx.doses = [1, 0, 0, 1]; // 2 pills / day
    rx.quantity = 70; // 70 / 2 = 35 days (> 30 days)

    expect(component.getRxDailyDose(rx)).toBe(2);
    expect(component.getRxDays(rx)).toBe(35);
    expect(component.hasChronicOver30Warning).toBe(true);

    // When reduced to 60 pills => 30 days (Pass)
    rx.quantity = 60;
    expect(component.getRxDays(rx)).toBe(30);
    expect(component.hasChronicOver30Warning).toBe(false);
  });

  it('TC-UI-CONSULT-08: should handle 24h EMR locked state and prevent direct editing', () => {
    component.isLocked = true;
    component.saveDraft();
    expect(component.saveMessage).toBe(''); // No draft save when locked

    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('HỒ SƠ ĐÃ KHÓA 24H (CHỈ ĐỌC)');
  });

  it('TC-UI-CONSULT-09: should open Addendum modal and submit addendum with medical reason', () => {
    const mockAddendum = {
      id: 'add-1',
      recordId: 'rec-123',
      reason: 'Bổ sung kết quả X-quang phổi',
      doctorUserId: 'doc-user-1',
      doctorName: 'BS. Lê Cường',
      doctorLicenseNumber: 'CCHN-12345',
      previousContent: { clinicalNotes: 'Cũ' },
      updatedContent: { clinicalNotes: 'Mới: X-quang bình thường' },
      createdAt: '2026-09-28T03:00:00Z',
    } as unknown as EmrAddendumData;
    clinicalService.createEmrAddendum.and.returnValue(of(mockAddendum));

    component.openAddendumModal();
    expect(component.showAddendumModal).toBe(true);

    component.addendumReason = 'Bổ sung kết quả X-quang phổi';
    component.addendumClinicalNotes = 'Mới: X-quang bình thường';
    component.submitAddendum();

    expect(clinicalService.createEmrAddendum).toHaveBeenCalledWith('rec-123', {
      reason: 'Bổ sung kết quả X-quang phổi',
      clinicalNotes: 'Mới: X-quang bình thường',
      doctorAdvice: 'Uống thuốc đúng giờ',
      icd10SecondaryCodes: null,
      followUpDate: '2026-10-15',
    });
    expect(component.showAddendumModal).toBe(false);
    expect(component.saveMessage).toContain('Đã lưu phụ lục bệnh án thành công');
  });

  it('TC-UI-CONSULT-10: should reject addendum submission when medical reason is empty', () => {
    component.openAddendumModal();
    component.addendumReason = '   ';
    component.submitAddendum();

    expect(component.addendumError).toBe('Vui lòng nhập lý do y khoa tạo phụ lục.');
    expect(clinicalService.createEmrAddendum).not.toHaveBeenCalled();
  });
});
