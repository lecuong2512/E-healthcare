import { Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

// ─── Constants (SRS-PAT-02 §5.1) ────────────────────────────
const TOTAL_SECONDS = 10 * 60; // 600s TTL

export interface Doctor {
  id: string | number;
  title: string;
  name: string;
  specialty: string;
  hospital: string;
  fee: number;
  rating: number;
}

export interface DayOption {
  dayOfWeek: string;
  date: string;
  fullDate: string;
  slotsCount: number;
}

export interface SlotItem {
  id: string;
  time: string;
  status: 'available' | 'holding' | 'booked';
  date?: string;
}

@Component({
  selector: 'app-booking-stepper-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './booking-stepper.page.html',
})
export class BookingStepperPage implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ─── Stepper ─────────────────────────────────────────────
  readonly step = signal<number>(1);

  // ─── Step 1: Doctor list ──────────────────────────────────
  readonly specialties = ['Tất cả', 'Tim mạch', 'Nội tổng quát', 'Ngoại khoa', 'Nhi khoa', 'Da liễu', 'Tai Mũi Họng'];
  readonly selectedSpecialty = signal<string>('Tất cả');
  readonly searchQuery = signal<string>('');

  readonly doctors: Doctor[] = [
    { id: 1, title: 'PGS.TS.BS', name: 'Trần Văn Tiến',  specialty: 'Tim mạch',       hospital: 'BV Chợ Rẫy',          fee: 350000, rating: 4.9 },
    { id: 2, title: 'TS.BS',     name: 'Nguyễn Thị Lan',  specialty: 'Nội tổng quát',  hospital: 'BV Bạch Mai',          fee: 280000, rating: 4.8 },
    { id: 3, title: 'ThS.BS',    name: 'Phạm Minh Khoa',  specialty: 'Nhi khoa',        hospital: 'BV Nhi TW',            fee: 250000, rating: 4.6 },
    { id: 4, title: 'BS.CKI',    name: 'Hoàng Thị Thu',   specialty: 'Da liễu',         hospital: 'BV Da liễu TP.HCM',   fee: 320000, rating: 4.8 },
    { id: 5, title: 'BSCKII',    name: 'Lê Văn Nam',      specialty: 'Ngoại khoa',      hospital: 'BV 108',               fee: 420000, rating: 4.7 },
    { id: 6, title: 'PGS.TS.BS', name: 'Võ Đình Phúc',    specialty: 'Tai Mũi Họng',   hospital: 'BV TMH TW',            fee: 550000, rating: 4.9 },
  ];

  readonly selectedDoctorId = signal<string | number | null>(null);

  readonly filteredDoctors = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const sp = this.selectedSpecialty();
    return this.doctors.filter(d => {
      const matchSpec = sp === 'Tất cả' || d.specialty === sp;
      const matchQ = q === '' || d.name.toLowerCase().includes(q) || d.specialty.toLowerCase().includes(q) || d.hospital.toLowerCase().includes(q);
      return matchSpec && matchQ;
    });
  });

  readonly selectedDoctor = computed(() =>
    this.doctors.find(d => d.id === this.selectedDoctorId()) ?? null
  );

  // ─── Step 2: Time slots ───────────────────────────────────
  readonly days: DayOption[] = [
    { dayOfWeek: 'Th.2', date: '08/09', fullDate: '2026-09-08', slotsCount: 3 },
    { dayOfWeek: 'Th.3', date: '09/09', fullDate: '2026-09-09', slotsCount: 0 },
    { dayOfWeek: 'Th.4', date: '10/09', fullDate: '2026-09-10', slotsCount: 5 },
    { dayOfWeek: 'Th.5', date: '11/09', fullDate: '2026-09-11', slotsCount: 2 },
    { dayOfWeek: 'Th.6', date: '12/09', fullDate: '2026-09-12', slotsCount: 8 },
    { dayOfWeek: 'Th.7', date: '13/09', fullDate: '2026-09-13', slotsCount: 4 },
    { dayOfWeek: 'CN',   date: '14/09', fullDate: '2026-09-14', slotsCount: 1 },
  ];
  readonly selectedDay = signal<string>('08/09');

  readonly morningSlots: SlotItem[] = [
    { id: 'm1', time: '08:00', status: 'available' },
    { id: 'm2', time: '08:30', status: 'available' },
    { id: 'm3', time: '09:00', status: 'holding'   },
    { id: 'm4', time: '09:30', status: 'booked'    },
    { id: 'm5', time: '10:00', status: 'available' },
    { id: 'm6', time: '10:30', status: 'booked'    },
    { id: 'm7', time: '11:00', status: 'available' },
    { id: 'm8', time: '11:30', status: 'holding'   },
  ];

  readonly afternoonSlots: SlotItem[] = [
    { id: 'a1', time: '13:30', status: 'available' },
    { id: 'a2', time: '14:00', status: 'available' },
    { id: 'a3', time: '14:30', status: 'holding'   },
    { id: 'a4', time: '15:00', status: 'booked'    },
    { id: 'a5', time: '15:30', status: 'available' },
    { id: 'a6', time: '16:00', status: 'booked'    },
    { id: 'a7', time: '16:30', status: 'available' },
    { id: 'a8', time: '17:00', status: 'holding'   },
  ];

  readonly selectedSlotId = signal<string | null>(null);
  readonly selectedSlotLabel = computed(() => {
    const all = [...this.morningSlots, ...this.afternoonSlots];
    const s = all.find(x => x.id === this.selectedSlotId());
    if (!s) return '';
    return `${s.time} – ${this.calcEndTime(s.time)}`;
  });

  // ─── Step 3: Patient form ─────────────────────────────────
  readonly patientForm = this.fb.group({
    fullName: ['', Validators.required],
    phone:    ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    dob:      ['', Validators.required],
    gender:   [''],
    reason:   [''],
  });

  // ─── Step 4: Payment method ───────────────────────────────
  readonly paymentMethod = signal<string>('vnpay');
  readonly paymentMethods = [
    { id: 'vnpay',    label: 'VNPay',           icon: '💳' , iconPath: 'assets/vnpay.webp'},
    { id: 'momo',     label: 'MoMo',            icon: '💜' , iconPath: 'assets/momo.png'},
    { id: 'banking',  label: 'Chuyển khoản',    icon: '🏦' , iconPath: null},
    { id: 'cash',     label: 'Tiền mặt tại viện', icon: '💵' , iconPath: null},
  ];

  // ─── Countdown timer ─────────────────────────────────────
  readonly countdownSeconds = signal<number>(TOTAL_SECONDS);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedFileName = signal<string | null>(null);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  readonly formattedCountdown = computed(() => {
    const t = this.countdownSeconds();
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  readonly timerPercent = computed(() =>
    (this.countdownSeconds() / TOTAL_SECONDS) * 100
  );

  constructor() {
    const doctorId = this.route.snapshot.queryParamMap.get('doctorId');
    const doctor = this.doctors.find(item => String(item.id) === doctorId);
    if (doctor) {
      this.selectedDoctorId.set(doctor.id);
      this.step.set(2);
    }
  }

  // ─── Timer helpers ────────────────────────────────────────
  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.countdownSeconds.set(TOTAL_SECONDS);
    this.timerInterval = setInterval(() => {
      this.countdownSeconds.update(v => {
        if (v <= 1) { this.handleTimeout(); return 0; }
        return v - 1;
      });
    }, 1000);
  }

  handleTimeout() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    alert('Hết thời gian giữ chỗ! Hệ thống sẽ reset form.');
    this.step.set(2);
    this.selectedSlotId.set(null);
    this.patientForm.reset();
    this.countdownSeconds.set(TOTAL_SECONDS);
    this.timerInterval = null;
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  // ─── Step 1 ───────────────────────────────────────────────
  selectDoctor(d: Doctor) {
    this.selectedDoctorId.set(d.id);
  }

  selectDoctorAndContinue(d: Doctor): void {
    this.selectDoctor(d);
    this.goToStep(2);
  }

  setSearchQuery(q: string) {
    this.searchQuery.set(q);
  }

  selectSpecialty(sp: string) {
    this.selectedSpecialty.set(sp);
  }

  confirmDoctor() {
    if (this.selectedDoctorId() !== null) {
      this.goToStep(2);
    }
  }

  // ─── Step 2 ───────────────────────────────────────────────
  selectDate(d: DayOption) {
    if (d.slotsCount > 0) this.selectedDay.set(d.date);
  }

  chooseSlot(slot: SlotItem) {
    if (slot.status === 'available') {
      this.selectedSlotId.set(slot.id);
      this.startTimer();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('Tệp không được vượt quá 10MB.');
      input.value = '';
      return;
    }
    this.selectedFileName.set(file.name);
  }

  private calcEndTime(start: string): string {
    const [h, m] = start.split(':').map(Number);
    const tot = h * 60 + m + 30;
    return `${Math.floor(tot / 60).toString().padStart(2, '0')}:${(tot % 60).toString().padStart(2, '0')}`;
  }

  // ─── Step 4 ───────────────────────────────────────────────
  selectPayment(id: string) {
    this.paymentMethod.set(id);
  }

  submitBooking() {
    if (this.selectedSlotId() === null || this.patientForm.invalid) return;

    const method = this.paymentMethod();
    this.router.navigate(['/patient/payment-qr', method]);
  }

  // ─── Navigation ───────────────────────────────────────────
  goToStep(s: number) {
    this.step.set(s);
  }

  // ─── Utility ──────────────────────────────────────────────
  readonly selectedDayLabel = computed(() => {
    const d = this.days.find(x => x.date === this.selectedDay());
    return d ? `${d.dayOfWeek} ${d.date}` : '';
  });

  starArray(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating));
  }

  get formValue() {
    return this.patientForm.value;
  }
}