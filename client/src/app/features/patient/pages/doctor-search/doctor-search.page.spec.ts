import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { DoctorSearchPage } from './doctor-search.page';

describe('DoctorSearchPage', () => {
  let fixture: ComponentFixture<DoctorSearchPage>;
  let component: DoctorSearchPage;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorSearchPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorSearchPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('filters the local doctor list by search query', () => {
    expect(component.doctors().length).toBe(6);

    component.searchQuery.set('lan');

    expect(component.filteredDoctors().length).toBe(1);
    component.searchQuery.set('missing');
    expect(component.filteredDoctors().length).toBe(0);
  });

  it('filters by specialty and fee range', () => {
    component.selectedSpecialty.set('Tim mạch');
    component.selectedFee.set('mid');

    expect(component.filteredDoctors().map(doctor => doctor.id)).toEqual([1]);

    component.selectedFee.set('low');
    expect(component.filteredDoctors()).toEqual([]);
  });
});
