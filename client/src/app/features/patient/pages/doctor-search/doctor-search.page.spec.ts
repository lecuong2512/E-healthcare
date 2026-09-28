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
  });
});
