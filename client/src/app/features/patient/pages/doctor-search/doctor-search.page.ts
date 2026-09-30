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
}

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
  readonly selectedDate = signal<'today' | 'tomorrow' | 'pick'>('today');
  readonly selectedFee = signal<string | null>(null);
  readonly filterHighRating = signal(false);
  readonly filterAvailableToday = signal(false);
  readonly filterOpen = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly doctors = signal<Doctor[]>([]);

  readonly filteredDoctors = computed(() => {
    const query = this.searchQuery().toLocaleLowerCase('vi').trim();
    const specialty = this.selectedSpecialty();
    const fee = this.selectedFee();
    return this.doctors().filter((doctor) => {
      const matchesSearch = !query || [doctor.name, doctor.specialty, doctor.hospital]
        .some((value) => value.toLocaleLowerCase('vi').includes(query));
      const matchesSpecialty = !specialty || doctor.specialty === specialty;
      const matchesRating = !this.filterHighRating() || doctor.rating >= 4;
      const matchesAvailability = !this.filterAvailableToday() || doctor.availableToday;
      const matchesFee = fee === 'low'
        ? doctor.price < 300_000
        : fee === 'mid'
          ? doctor.price >= 300_000 && doctor.price <= 500_000
          : fee === 'high'
            ? doctor.price > 500_000
            : true;
      return matchesSearch && matchesSpecialty && matchesRating && matchesAvailability && matchesFee;
    });
  });

  constructor() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    forkJoin({
      response: this.api.searchDoctors(),
      available: this.api.searchDoctors(today).pipe(catchError(() => of(null))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ response, available }) => {
        const availableIds = new Set(available?.data.map(doctor => doctor.id));
        this.doctors.set(response.data.map((doctor) => ({
          id: doctor.id,
          degree: doctor.academicTitle || 'Bác sĩ',
          name: doctor.fullName,
          specialty: doctor.specialty.name,
          hospital: `Phòng khám ${doctor.roomNumber}`,
          experienceYears: 0,
          tags: [doctor.specialty.name],
          services: [doctor.bioDescription || `Khám chuyên khoa ${doctor.specialty.name}`],
          availableToday: availableIds.has(doctor.id),
          price: Number(doctor.consultationFee),
          rating: Number(doctor.ratingAverage),
          reviewCount: 0,
          avatarUrl: doctor.avatarUrl ?? null,
        })));
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

  toggleFee(value: string): void {
    this.selectedFee.update((current) => current === value ? null : value);
  }

  toggleFilters(): void { this.filterOpen.update((open) => !open); }
  closeFilters(): void { this.filterOpen.set(false); }
}
