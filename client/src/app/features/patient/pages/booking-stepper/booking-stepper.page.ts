import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentMethod } from '@shared/enums';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { catchError, finalize, of, switchMap } from 'rxjs';

import { PatientConsentCheckboxComponent } from '../../../../shared/components/patient-consent-checkbox/patient-consent-checkbox.component';
import { PatientBookingApiService, PatientDoctorDetail, PatientDoctorSchedule, PatientDoctorSummary, PatientVoucher } from '../../data-access/patient-booking-api.service';
import { PaymentRedirectService } from '../../data-access/payment-redirect.service';

const TOTAL_SECONDS = 10 * 60;

export interface Doctor {
  id: string;
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, PatientConsentCheckboxComponent, NzAlertModule],
  templateUrl: './booking-stepper.page.html',
})
export class BookingStepperPage implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PatientBookingApiService);
  private readonly paymentRedirect = inject(PaymentRedirectService);

  readonly step = signal(1);
  readonly specialties = ['Tất cả', 'Tim mạch', 'Nội tổng quát', 'Ngoại khoa', 'Nhi khoa', 'Da liễu', 'Tai Mũi Họng'];
  readonly selectedSpecialty = signal('Tất cả');
  readonly searchQuery = signal('');
  readonly doctors = signal<Doctor[]>([]);
  readonly selectedDoctorId = signal<string | null>(null);
  readonly filteredDoctors = computed(() => {
    const query = this.searchQuery().toLocaleLowerCase('vi').trim();
    const specialty = this.selectedSpecialty();
    return this.doctors().filter((doctor) =>
      (specialty === 'Tất cả' || doctor.specialty === specialty) &&
      (!query || [doctor.name, doctor.specialty, doctor.hospital]
        .some((value) => value.toLocaleLowerCase('vi').includes(query))),
    );
  });
  readonly selectedDoctor = computed(() =>
    this.doctors().find((doctor) => doctor.id === this.selectedDoctorId()) ?? null,
  );

  days: DayOption[] = [];
  readonly selectedDay = signal('');
  morningSlots: SlotItem[] = [];
  afternoonSlots: SlotItem[] = [];
  private schedules: PatientDoctorSchedule[] = [];
  readonly selectedSlotId = signal<string | null>(null);
  readonly selectedSlotLabel = computed(() => {
    const slot = [...this.morningSlots, ...this.afternoonSlots]
      .find((item) => item.id === this.selectedSlotId());
    return slot ? `${slot.time} – ${this.calcEndTime(slot.time)}` : '';
  });

  readonly patientForm = this.fb.group({
    fullName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    dob: ['', Validators.required],
    gender: [''],
    reason: [''],
  });

  readonly paymentMethod = signal<PaymentMethod>(PaymentMethod.VNPAY);
  readonly paymentMethods = [
    { id: PaymentMethod.VNPAY, label: 'VNPay', icon: '💳', iconPath: 'assets/vnpay.webp' },
    { id: PaymentMethod.MOMO, label: 'MoMo', icon: '👛', iconPath: 'assets/momo.png' },
    { id: PaymentMethod.PAY_AT_CLINIC, label: 'Thanh toán tại viện', icon: '💵', iconPath: null },
  ];
  readonly voucherCode = signal('');
  readonly appliedVoucher = signal<{ code: string; discount: number } | null>(null);
  readonly voucherMessage = signal<string | null>(null);
  readonly vouchers = signal<PatientVoucher[]>([]);

  readonly countdownSeconds = signal(TOTAL_SECONDS);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedFileName = signal<string | null>(null);
  consentAccepted = false;
  consentError = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private reservationId: string | null = null;
  private bookingCommitted = false;
  private idempotencyKey: string | null = null;

  readonly formattedCountdown = computed(() => {
    const seconds = this.countdownSeconds();
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  });
  readonly timerPercent = computed(() => (this.countdownSeconds() / TOTAL_SECONDS) * 100);
  readonly bookingFee = computed(() => this.selectedDoctor()?.fee ?? 0);
  readonly discountAmount = computed(() => this.appliedVoucher()?.discount ?? 0);
  readonly payableAmount = computed(() => Math.max(0, this.bookingFee() - this.discountAmount()));
  readonly selectedDayLabel = computed(() => {
    const day = this.days.find((item) => item.date === this.selectedDay());
    return day ? `${day.dayOfWeek} ${day.date}` : '';
  });

  constructor() {
    const doctorId = this.route.snapshot.queryParamMap.get('doctorId');
    this.api.searchDoctors().subscribe({
      next: (response) => this.doctors.set(response.data.map((doctor) => this.mapDoctor(doctor))),
      error: () => this.errorMessage.set('Không thể tải danh sách bác sĩ.'),
    });
    this.api.getVouchers().subscribe({
      next: (vouchers) => this.vouchers.set(vouchers.filter((voucher) =>
        !voucher.isUsed && new Date(voucher.expiresAt).getTime() > Date.now(),
      )),
      error: () => this.vouchers.set([]),
    });
    if (doctorId) this.loadDoctor(doctorId);
  }

  startTimer(ttlSeconds = TOTAL_SECONDS): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.countdownSeconds.set(ttlSeconds);
    this.timerInterval = setInterval(() => {
      this.countdownSeconds.update((value) => {
        if (value <= 1) {
          this.handleTimeout();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }

  handleTimeout(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.releaseReservation();
    this.errorMessage.set('Hết thời gian giữ chỗ. Vui lòng chọn lại khung giờ.');
    this.step.set(2);
    this.selectedSlotId.set(null);
    this.countdownSeconds.set(TOTAL_SECONDS);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (!this.bookingCommitted) this.releaseReservation();
  }

  selectDoctor(doctor: Doctor): void { this.selectedDoctorId.set(doctor.id); }
  selectDoctorAndContinue(doctor: Doctor): void { this.selectDoctor(doctor); this.loadDoctor(doctor.id); }
  setSearchQuery(query: string): void { this.searchQuery.set(query); }
  selectSpecialty(specialty: string): void { this.selectedSpecialty.set(specialty); }
  confirmDoctor(): void { const id = this.selectedDoctorId(); if (id) this.loadDoctor(id); }

  selectDate(day: DayOption): void {
    if (!day.slotsCount) return;
    this.selectedDay.set(day.date);
    this.refreshSlots(day.fullDate);
  }

  chooseSlot(slot: SlotItem): void {
    const doctorId = this.selectedDoctorId();
    if (slot.status !== 'available' || !doctorId || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    const release$ = this.reservationId
      ? this.api.releaseSlot({ doctorId, slotId: this.selectedSlotId()!, reservationId: this.reservationId })
          .pipe(catchError(() => of(null)))
      : of(null);
    release$.pipe(
      switchMap(() => this.api.reserveSlot({ doctorId, slotId: slot.id })),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (response) => {
        this.reservationId = response.data.reservationId;
        this.selectedSlotId.set(slot.id);
        this.startTimer(response.data.ttlSeconds);
      },
      error: (error) => this.errorMessage.set(this.errorText(error)),
    });
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

  selectPayment(method: PaymentMethod): void { this.paymentMethod.set(method); }

  applyVoucher(code = this.voucherCode()): void {
    const normalizedCode = code.trim().toUpperCase();
    const fee = this.selectedDoctor()?.fee ?? 0;
    if (!normalizedCode || fee <= 0) {
      this.appliedVoucher.set(null);
      this.voucherMessage.set('Vui lòng chọn bác sĩ và nhập mã voucher.');
      return;
    }
    this.voucherCode.set(normalizedCode);
    this.appliedVoucher.set(null);
    this.voucherMessage.set(null);
    this.api.validateVoucher(normalizedCode, fee).subscribe({
      next: (voucher) => {
        this.appliedVoucher.set({
          code: voucher.code,
          discount: Math.min(Number(voucher.discountAmount), fee),
        });
        this.voucherMessage.set(`Đã áp dụng mã ${voucher.code}.`);
      },
      error: () => this.voucherMessage.set('Mã voucher không hợp lệ hoặc đã hết hạn.'),
    });
  }

  selectVoucher(code: string): void { this.voucherCode.set(code); this.applyVoucher(code); }
  removeVoucher(): void { this.voucherCode.set(''); this.appliedVoucher.set(null); this.voucherMessage.set(null); }

  submitBooking(): void {
    const doctorId = this.selectedDoctorId();
    const slotId = this.selectedSlotId();
    if (!doctorId || !slotId || !this.reservationId || this.patientForm.invalid) return;
    if (!this.consentAccepted) { this.consentError = true; return; }
    if (this.loading()) return;

    const method = this.paymentMethod();
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.confirmBooking({
      doctorId,
      slotId,
      reservationId: this.reservationId,
      reasonForVisit: this.patientForm.value.reason?.trim() || 'Khám theo lịch hẹn',
      paymentMethod: method,
      voucherCode: this.appliedVoucher()?.code,
    }).pipe(
      switchMap((appointment) => {
        this.bookingCommitted = true;
        if (method === PaymentMethod.PAY_AT_CLINIC) return of({ appointment, payment: null });
        this.idempotencyKey ||= crypto.randomUUID();
        return this.api.initiatePayment(appointment.id, method, this.idempotencyKey)
          .pipe(switchMap((payment) => of({ appointment, payment })));
      }),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: ({ appointment, payment }) => {
        if (!payment) { void this.router.navigate(['/patient/history']); return; }
        sessionStorage.setItem('pendingPaymentAppointmentId', appointment.id);
        try {
          this.paymentRedirect.redirect(payment.paymentUrl);
        } catch {
          this.errorMessage.set('Cổng thanh toán trả về địa chỉ không an toàn.');
        }
      },
      error: (error) => this.errorMessage.set(this.errorText(error)),
    });
  }

  goToStep(step: number): void { this.step.set(step); }
  starArray(rating: number): boolean[] { return Array.from({ length: 5 }, (_, index) => index < Math.round(rating)); }
  get formValue() { return this.patientForm.value; }

  private loadDoctor(doctorId: string): void {
    this.loading.set(true);
    this.api.getDoctor(doctorId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (detail) => {
        const doctor = this.mapDoctor(detail);
        this.doctors.update((items) => [doctor, ...items.filter((item) => item.id !== doctor.id)]);
        this.selectedDoctorId.set(doctor.id);
        this.schedules = detail.availableSchedules;
        this.days = this.buildDays(detail.availableSchedules);
        if (this.days[0]) this.selectDate(this.days[0]);
        this.step.set(2);
      },
      error: (error) => this.errorMessage.set(this.errorText(error)),
    });
  }

  private mapDoctor(doctor: PatientDoctorSummary | PatientDoctorDetail): Doctor {
    return {
      id: doctor.id,
      title: doctor.academicTitle || 'Bác sĩ',
      name: doctor.fullName,
      specialty: doctor.specialty.name,
      hospital: `Phòng ${doctor.roomNumber}`,
      fee: Number(doctor.consultationFee),
      rating: Number(doctor.ratingAverage),
    };
  }

  private buildDays(schedules: PatientDoctorSchedule[]): DayOption[] {
    const counts = new Map<string, number>();
    for (const schedule of schedules) {
      if (!counts.has(schedule.date)) counts.set(schedule.date, 0);
      if (schedule.status === 'AVAILABLE') {
        counts.set(schedule.date, (counts.get(schedule.date) || 0) + 1);
      }
    }
    return [...counts.entries()].map(([fullDate, slotsCount]) => {
      const date = new Date(`${fullDate}T00:00:00+07:00`);
      return {
        dayOfWeek: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date),
        date: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date),
        fullDate,
        slotsCount,
      };
    });
  }

  private refreshSlots(fullDate: string): void {
    const slots = this.schedules.filter((schedule) => schedule.date === fullDate).map((schedule) => ({
      id: schedule.id,
      time: schedule.startTime.slice(0, 5),
      status: this.mapSlotStatus(schedule.status),
      date: schedule.date,
    }));
    this.morningSlots = slots.filter((slot) => Number(slot.time.slice(0, 2)) < 12);
    this.afternoonSlots = slots.filter((slot) => Number(slot.time.slice(0, 2)) >= 12);
  }

  private mapSlotStatus(status: string): SlotItem['status'] {
    if (status === 'AVAILABLE') return 'available';
    if (status === 'HOLDING') return 'holding';
    return 'booked';
  }

  private calcEndTime(start: string): string {
    const [hours, minutes] = start.split(':').map(Number);
    const total = hours * 60 + minutes + 30;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  }

  private releaseReservation(): void {
    const doctorId = this.selectedDoctorId();
    const slotId = this.selectedSlotId();
    const reservationId = this.reservationId;
    if (!doctorId || !slotId || !reservationId) return;
    this.reservationId = null;
    this.api.releaseSlot({ doctorId, slotId, reservationId }).subscribe({ error: () => undefined });
  }

  private errorText(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return Array.isArray(message) ? message.join(' ') : message || 'Không thể xử lý yêu cầu.';
    }
    return 'Không thể xử lý yêu cầu.';
  }
}
