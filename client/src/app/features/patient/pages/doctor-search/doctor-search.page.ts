import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';

export interface Doctor {
  id: string;
  degree: string;
  name: string;
  specialty: string;
  specialties?: string[];
  hospital: string;
  experienceYears: number;
  tags: string[];
  services: string[];
  extraServicesCount?: number;
  availableToday: boolean;
  price: number;
  rating: number;
  reviewCount: number;
  avatarUrl?: string | null;
  availableDates?: string[];
  schedules?: { date: string }[];
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

@Component({
  selector: 'app-doctor-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './doctor-search.page.html',
  styleUrl: './doctor-search.page.scss',
})
export class DoctorSearchPage {
  private readonly api = inject(PatientBookingApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly specialties = ['Nội tổng quát', 'Ngoại khoa', 'Nhi khoa', 'Da liễu', 'Tim mạch', 'Tai Mũi Họng'];
  readonly feeRanges = [
    { label: '< 300.000đ', value: 'low' },
    { label: '300.000đ – 500.000đ', value: 'mid' },
    { label: '> 500.000đ', value: 'high' },
  ];
  readonly searchQuery = signal('');
  readonly selectedSpecialty = signal<string | null>(null);
  readonly selectedDate = signal<string | null>(null);
  readonly customDate = signal<string>('');
  readonly selectedFee = signal<string | null>(null);
  readonly filterHighRating = signal(false);
  readonly filterAvailableToday = signal(false);
  readonly filterOpen = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly doctors = signal<Doctor[]>([]);

  readonly todayStr: string;
  readonly tomorrowStr: string;
  private readonly availableDoctorIdsByDate = new Map<string, Set<string>>();
  private readonly availabilityLoaded = signal(0);

  readonly filteredDoctors = computed(() => {
    this.availabilityLoaded();
    const query = this.searchQuery().toLocaleLowerCase('vi').trim();
    const specialty = this.selectedSpecialty();
    const fee = this.selectedFee();
    const dateVal = this.selectedDate();

    return this.doctors().filter((doctor) => {
      const matchesSearch = !query || [doctor.name, doctor.specialty, doctor.hospital]
        .some((value) => value.toLocaleLowerCase('vi').includes(query));

      const matchesSpecialty = !specialty || (() => {
        const clean = (s: string) => normalize(s).replace(/\bkhoa\b/gi, '').trim();
        const cleanSpec = clean(specialty);
        if (!cleanSpec) return true;

        const cleanDocSpec = clean(doctor.specialty || '');
        if (cleanDocSpec.includes(cleanSpec) || cleanSpec.includes(cleanDocSpec)) {
          return true;
        }

        if (doctor.specialties && doctor.specialties.some(sp => {
          const c = clean(sp);
          return c.includes(cleanSpec) || cleanSpec.includes(c);
        })) {
          return true;
        }

        if (doctor.tags && doctor.tags.some(tag => {
          const c = clean(tag);
          return c.includes(cleanSpec) || cleanSpec.includes(c);
        })) {
          return true;
        }

        return false;
      })();

      const matchesRating = !this.filterHighRating() || doctor.rating >= 4;
      const matchesAvailability = !this.filterAvailableToday() || doctor.availableToday;

      let matchesDate = true;
      if (dateVal && dateVal !== 'pick') {
        const targetDate = dateVal === 'today' ? this.todayStr : dateVal === 'tomorrow' ? this.tomorrowStr : dateVal;
        matchesDate = (targetDate === this.todayStr && doctor.availableToday)
          || (doctor.availableDates?.includes(targetDate) ?? false)
          || (doctor.schedules?.some(s => s.date === targetDate) ?? false)
          || (this.availableDoctorIdsByDate.get(targetDate)?.has(doctor.id) ?? false);
      }

      const matchesFee = fee === 'low'
        ? doctor.price < 300_000
        : fee === 'mid'
          ? doctor.price >= 300_000 && doctor.price <= 500_000
          : fee === 'high'
            ? doctor.price > 500_000
            : true;

      return matchesSearch && matchesSpecialty && matchesRating && matchesAvailability && matchesDate && matchesFee;
    });
  });

  constructor() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    this.todayStr = `${part('year')}-${part('month')}-${part('day')}`;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmwParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(tomorrow);
    const tmwPart = (type: string) => tmwParts.find(item => item.type === type)?.value;
    this.tomorrowStr = `${tmwPart('year')}-${tmwPart('month')}-${tmwPart('day')}`;

    forkJoin({
      response: this.api.searchDoctors(),
      available: this.api.searchDoctors(this.todayStr).pipe(catchError(() => of(null))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ response, available }) => {
        const availableIds = new Set(available?.data.map(doctor => doctor.id));
        this.availableDoctorIdsByDate.set(this.todayStr, availableIds);
        this.doctors.set(response.data.map((doctor) => {
          const allSpecs = doctor.specialties && doctor.specialties.length > 0
            ? doctor.specialties.map(s => s.name)
            : [doctor.specialty.name];
          const fee = Number(doctor.consultationFee);
          return {
            id: doctor.id,
            degree: doctor.academicTitle || 'Bác sĩ',
            name: doctor.fullName,
            specialty: doctor.specialty.name,
            specialties: allSpecs,
            hospital: `Phòng khám ${doctor.roomNumber}`,
            experienceYears: 0,
            tags: allSpecs,
            services: [doctor.bioDescription || `Khám chuyên khoa ${doctor.specialty.name}`],
            availableToday: availableIds.has(doctor.id),
            price: fee > 0 ? fee : 200000,
            rating: Number(doctor.ratingAverage),
            reviewCount: 0,
            avatarUrl: doctor.avatarUrl ?? null,
          };
        }));
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
        this.loading.set(false);
      },
    });
  }

  toggleSpecialty(specialty: string): void {
    this.selectedSpecialty.update((current) => current === specialty ? null : specialty);
  }

  selectDate(opt: string | null): void {
    if (this.selectedDate() === opt) {
      this.selectedDate.set(null);
      return;
    }
    this.selectedDate.set(opt);
    this.fetchAvailabilityForDate(opt);
  }

  onCustomDateChange(date: string): void {
    this.customDate.set(date);
    if (date) {
      this.selectedDate.set(date);
      this.fetchAvailabilityForDate(date);
    } else {
      this.selectedDate.set('pick');
    }
  }

  isCustomDateSelected(): boolean {
    const val = this.selectedDate();
    return !!val && val !== 'today' && val !== 'tomorrow';
  }

  fetchAvailabilityForDate(dateVal: string | null): void {
    if (!dateVal || dateVal === 'pick') return;
    const targetDate = dateVal === 'today' ? this.todayStr : dateVal === 'tomorrow' ? this.tomorrowStr : dateVal;
    if (this.availableDoctorIdsByDate.has(targetDate)) return;
    this.api.searchDoctors(targetDate).pipe(
      catchError(() => of(null)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((res) => {
      if (res) {
        this.availableDoctorIdsByDate.set(targetDate, new Set(res.data.map(d => d.id)));
        this.availabilityLoaded.update(v => v + 1);
      }
    });
  }

  toggleFee(value: string): void {
    this.selectedFee.update((current) => current === value ? null : value);
  }

  toggleFilters(): void { this.filterOpen.update((open) => !open); }
  closeFilters(): void { this.filterOpen.set(false); }
}
