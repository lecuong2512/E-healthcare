import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';
import { DoctorSearchPage } from './doctor-search.page';

describe('DoctorSearchPage', () => {
  it('loads real doctor IDs and keeps the local filters', async () => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['searchDoctors']);
    api.searchDoctors.and.returnValue(of({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          fullName: 'Nguyễn Văn An',
          academicTitle: 'BS.CKI',
          specialty: { id: 's1', name: 'Tim mạch' },
          consultationFee: 350_000,
          bioDescription: null,
          roomNumber: '101',
          ratingAverage: 4.9,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          fullName: 'Trần Thị Bình',
          academicTitle: null,
          specialty: { id: 's2', name: 'Nhi khoa' },
          consultationFee: 250_000,
          bioDescription: null,
          roomNumber: '102',
          ratingAverage: 4.7,
        },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    }));
    await TestBed.configureTestingModule({
      imports: [DoctorSearchPage],
      providers: [{ provide: PatientBookingApiService, useValue: api }],
    }).compileComponents();

    const component = TestBed.createComponent(DoctorSearchPage).componentInstance;
    component.selectedSpecialty.set('Tim mạch');
    component.selectedFee.set('mid');

    expect(component.filteredDoctors().map((doctor) => doctor.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(api.searchDoctors.calls.count()).toBe(2);
    expect(api.searchDoctors.calls.mostRecent().args[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('normalizes specialty comparison flexibly (e.g. Khoa Tim Mạch matches Tim mạch)', async () => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['searchDoctors']);
    api.searchDoctors.and.returnValue(of({
      data: [
        {
          id: 'doc-cardio',
          fullName: 'Nguyễn Văn An',
          academicTitle: 'BS.CKI',
          specialty: { id: 's1', name: 'Khoa Tim Mạch' },
          consultationFee: 350_000,
          bioDescription: null,
          roomNumber: '101',
          ratingAverage: 4.9,
        },
        {
          id: 'doc-pedia',
          fullName: 'Trần Thị Bình',
          academicTitle: null,
          specialty: { id: 's2', name: 'Khoa Nhi' },
          consultationFee: 350_000,
          bioDescription: null,
          roomNumber: '102',
          ratingAverage: 4.7,
        },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    }));
    await TestBed.configureTestingModule({
      imports: [DoctorSearchPage],
      providers: [{ provide: PatientBookingApiService, useValue: api }],
    }).compileComponents();

    const component = TestBed.createComponent(DoctorSearchPage).componentInstance;
    component.selectedSpecialty.set('Tim mạch');

    expect(component.filteredDoctors().map((d) => d.id)).toEqual(['doc-cardio']);
  });

  it('filters doctors by selectedDate when date is selected', async () => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['searchDoctors']);
    api.searchDoctors.and.returnValue(of({
      data: [
        {
          id: 'doc-today',
          fullName: 'Nguyễn Văn An',
          academicTitle: 'BS.CKI',
          specialty: { id: 's1', name: 'Tim mạch' },
          consultationFee: 350_000,
          bioDescription: null,
          roomNumber: '101',
          ratingAverage: 4.9,
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
    await TestBed.configureTestingModule({
      imports: [DoctorSearchPage],
      providers: [{ provide: PatientBookingApiService, useValue: api }],
    }).compileComponents();

    const component = TestBed.createComponent(DoctorSearchPage).componentInstance;
    expect(component.filteredDoctors().length).toBe(1);

    // Filter by specific custom date where doctor has no schedules
    component.selectedDate.set('2026-11-20');
    expect(component.filteredDoctors().length).toBe(0);

    // If doctor has schedule on that date
    component.doctors.update(docs => [
      { ...docs[0], availableDates: ['2026-11-20'] },
    ]);
    expect(component.filteredDoctors().length).toBe(1);
  });

  it('does not advertise today slots when the server returns no availability', async () => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['searchDoctors']);
    const doctor = {
      id: 'doctor-id', fullName: 'Nguyễn Văn An', academicTitle: null,
      specialty: { id: 's1', name: 'Tim mạch' }, consultationFee: 350_000,
      bioDescription: null, roomNumber: '101', ratingAverage: 4.9,
    };
    api.searchDoctors.and.callFake(date => of({
      data: date ? [] : [doctor], pagination: { page: 1, limit: 50, total: date ? 0 : 1, totalPages: 1 },
    }));
    await TestBed.configureTestingModule({
      imports: [DoctorSearchPage], providers: [{ provide: PatientBookingApiService, useValue: api }],
    }).compileComponents();
    const component = TestBed.createComponent(DoctorSearchPage).componentInstance;
    expect(component.doctors()[0].availableToday).toBeFalse();
    component.filterAvailableToday.set(true);
    expect(component.filteredDoctors()).toEqual([]);
  });
});
