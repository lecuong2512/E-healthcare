import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentTransactionStatus } from '@shared/enums';
import { AppointmentResponse, PaymentStatusResponse } from '@shared/interfaces';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzMessageModule, NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { catchError, finalize, of, switchMap } from 'rxjs';

import { PatientConsentCheckboxComponent } from '../../../../shared/components/patient-consent-checkbox/patient-consent-checkbox.component';
import { PatientBookingApiService, PatientDoctorDetail, PatientDoctorSchedule, PatientDoctorSummary, PatientVoucher } from '../../data-access/patient-booking-api.service';
import { PaymentRedirectService } from '../../data-access/payment-redirect.service';

const TOTAL_SECONDS = 10 * 60;
const PENDING_PAYMENT_CONTEXT_KEY = 'pendingPaymentContext';

interface PendingPaymentContext {
  appointmentId: string;
  provider?: PaymentMethod.VNPAY | PaymentMethod.MOMO;
  idempotencyKey?: string;
}

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
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    PatientConsentCheckboxComponent,
    NzAlertModule,
    NzMessageModule,
    NzModalModule,
  ],
  templateUrl: './booking-stepper.page.html',
})
export class BookingStepperPage implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PatientBookingApiService);
  private readonly paymentRedirect = inject(PaymentRedirectService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  readonly recoveryActive = signal(false);
  readonly checkoutStatus = signal<PaymentStatusResponse | null>(null);
  readonly canPay = computed(() => this.checkoutStatus()?.canRetry === true);
  readonly canFallback = computed(() => this.checkoutStatus()?.canFallbackToClinic === true);

  readonly step = signal(1);
  readonly payAtClinicReceipt = signal<AppointmentResponse | null>(null);
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
    { id: PaymentMethod.VNPAY, label: 'VNPay', iconPath: 'assets/vnpay.webp' },
    { id: PaymentMethod.MOMO, label: 'MoMo', iconPath: 'assets/momo.png' },
    { id: PaymentMethod.PAY_AT_CLINIC, label: 'Thanh toán tại viện', iconPath: null },
  ];
  readonly voucherCode = signal('');
  readonly appliedVoucher = signal<{ code: string; discount: number } | null>(null);
  readonly voucherMessage = signal<string | null>(null);
  readonly vouchers = signal<PatientVoucher[]>([]);

  readonly countdownSeconds = signal(TOTAL_SECONDS);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly pendingPaymentContext = signal<PendingPaymentContext | null>(
    this.readPendingPaymentContext(),
  );
  readonly selectedFileName = signal<string | null>(null);
  consentAccepted = false;
  consentError = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private reservationId: string | null = null;
  private bookingCommitted = false;
  private idempotencyKey: string | null = this.pendingPaymentContext()?.idempotencyKey ?? null;

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
    const requestedCheckout = this.route.snapshot.queryParamMap.get('appointmentId');
    if (requestedCheckout) {
      this.pendingPaymentContext.set({ appointmentId: requestedCheckout });
      this.recoveryActive.set(true);
      this.bookingCommitted = true;
      this.step.set(4);
    }
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
    const pendingPayment = this.pendingPaymentContext();
    if (pendingPayment) {
      this.checkPendingPayment(pendingPayment, false);
    }
    if (doctorId && !this.recoveryActive()) this.loadDoctor(doctorId);
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
    if (this.bookingCommitted) return;
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

  selectDoctor(doctor: Doctor): void { if (!this.recoveryActive()) this.selectedDoctorId.set(doctor.id); }
  selectDoctorAndContinue(doctor: Doctor): void { if (!this.recoveryActive()) { this.selectDoctor(doctor); this.loadDoctor(doctor.id); } }
  setSearchQuery(query: string): void { this.searchQuery.set(query); }
  selectSpecialty(specialty: string): void { this.selectedSpecialty.set(specialty); }
  confirmDoctor(): void { const id = this.selectedDoctorId(); if (id) this.loadDoctor(id); }

  selectDate(day: DayOption): void {
    if (!day.slotsCount) return;
    this.selectedDay.set(day.date);
    this.refreshSlots(day.fullDate);
  }

  chooseSlot(slot: SlotItem): void {
    if (this.pendingPaymentContext()) { this.errorMessage.set('Hãy hủy checkout cũ qua Bắt đầu đặt lịch mới trước khi giữ chỗ khác.'); return; }
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

  selectPayment(method: PaymentMethod): void {
    if (this.recoveryActive() && method === PaymentMethod.PAY_AT_CLINIC && !this.canFallback()) return;
    this.paymentMethod.set(method);
  }

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
    if (this.loading()) return;
    const pendingPayment = this.pendingPaymentContext();
    const currentMethod = this.paymentMethod();

    if (pendingPayment) {
      if (!this.recoveryActive()) {
        this.errorMessage.set('Bạn có checkout đang chờ. Hãy tiếp tục checkout hoặc chọn Bắt đầu đặt lịch mới để hủy checkout cũ trước.');
        return;
      }
      if (currentMethod === PaymentMethod.PAY_AT_CLINIC) {
        this.fallbackPendingToClinic();
        return;
      }
      if (!this.canPay()) {
        this.errorMessage.set('Checkout chưa thể thanh toán lại. Vui lòng kiểm tra trạng thái từ hệ thống.');
        return;
      }
      if (currentMethod === PaymentMethod.VNPAY || currentMethod === PaymentMethod.MOMO) {
        if (currentMethod !== pendingPayment.provider) {
          // Switch payment provider for the active pending appointment
          const newContext: PendingPaymentContext = {
            appointmentId: pendingPayment.appointmentId,
            provider: currentMethod,
            idempotencyKey: crypto.randomUUID(),
          };
          this.modal.confirm({
            nzTitle: 'Đổi cổng thanh toán?',
            nzContent: 'Giao dịch trước sẽ bị thay thế. Nếu cổng cũ ghi nhận tiền đến muộn, hệ thống sẽ xử lý hoàn tiền.',
            nzOkText: 'Xác nhận đổi cổng', nzCancelText: 'Giữ cổng hiện tại',
            nzOnOk: () => { this.persistPendingPaymentContext(newContext); this.initiateOnlinePayment(newContext, true); },
          });
          return;
        }
        // Same provider -> resume
        const resume = { ...pendingPayment, provider: currentMethod, idempotencyKey:
          this.checkoutStatus()?.transactionStatus === PaymentTransactionStatus.PENDING ? pendingPayment.idempotencyKey : crypto.randomUUID() };
        if (!resume.idempotencyKey) { this.checkPendingPayment(pendingPayment, false); return; }
        this.persistPendingPaymentContext(resume);
        this.initiateOnlinePayment(resume, false);
        return;
      }

    }

    const doctorId = this.selectedDoctorId();
    const slotId = this.selectedSlotId();
    if (!doctorId || !slotId || !this.reservationId || this.patientForm.invalid) return;
    if (!this.consentAccepted) { this.consentError = true; return; }
    if (this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.confirmBooking({
      doctorId,
      slotId,
      reservationId: this.reservationId,
      reasonForVisit: this.patientForm.value.reason?.trim() || 'Khám theo lịch hẹn',
      paymentMethod: currentMethod,
      voucherCode: this.appliedVoucher()?.code,
    }).pipe(finalize(() => { if (!this.pendingPaymentContext()) this.loading.set(false); })).subscribe({
      next: (appointment) => {
        this.bookingCommitted = true;
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;
        if (currentMethod === PaymentMethod.PAY_AT_CLINIC) {
          this.clearPendingPaymentContext();
          this.payAtClinicReceipt.set(appointment);
          this.message.success(
            'Đặt lịch thành công! Vui lòng có mặt tại quầy tiếp đón trước giờ khám để nộp viện phí.',
            { nzDuration: 6000 },
          );
          return;
        }
        this.idempotencyKey ||= crypto.randomUUID();
        const context: PendingPaymentContext = {
          appointmentId: appointment.id,
          provider: currentMethod,
          idempotencyKey: this.idempotencyKey,
        };
        this.persistPendingPaymentContext(context);
        this.recoveryActive.set(true);
        this.loading.set(false);
        this.initiateOnlinePayment(context);
      },
      error: (error) => this.errorMessage.set(this.errorText(error)),
    });
  }

  retryPendingPayment(): void {
    const context = this.pendingPaymentContext();
    if (!context || this.loading()) return;
    if (!this.recoveryActive() && context.provider) this.paymentMethod.set(context.provider);
    this.recoveryActive.set(true);
    this.bookingCommitted = true;
    this.step.set(4);
    this.checkPendingPayment(context, false);
  }

  startNewBooking(): void {
    if (!this.pendingPaymentContext()) { this.resetBookingFlow(); return; }
    this.cancelPendingPayment(true);
  }

  cancelPendingPayment(startNew = false): void {
    const context = this.pendingPaymentContext();
    if (!context || this.loading()) return;
    this.modal.confirm({
      nzTitle: startNew ? 'Hủy checkout cũ để đặt lịch mới?' : 'Hủy giao dịch đang chờ?',
      nzContent: 'Chỉ khi hệ thống xác nhận hủy thành công, chỗ giữ và voucher mới được giải phóng. Khoản tiền đến muộn sẽ được xử lý hoàn tiền.',
      nzOkText: 'Xác nhận hủy', nzCancelText: 'Tiếp tục giữ checkout', nzOkDanger: true,
      nzOnOk: () => {
        this.loading.set(true);
        this.errorMessage.set(null);
        this.api.cancelPendingPayment(context.appointmentId).pipe(finalize(() => this.loading.set(false))).subscribe({
          next: (response) => {
            if (response.appointmentStatus !== AppointmentStatus.CANCELLED) {
              this.errorMessage.set('Hệ thống chưa xác nhận hủy checkout. Vui lòng kiểm tra lại.');
              return;
            }
            this.clearPendingPaymentContext();
            this.resetBookingFlow();
            this.message.info('Đã hủy checkout. Bạn có thể đặt lịch mới.');
          },
          error: (error) => this.errorMessage.set(this.errorText(error)),
        });
      },
    });
  }

  fallbackPendingToClinic(): void {
    const context = this.pendingPaymentContext();
    if (!context || this.loading() || !this.canFallback()) return;
    this.modal.confirm({
      nzTitle: 'Thanh toán tại viện cho lịch hẹn này?',
      nzContent: 'Không tạo lịch hẹn mới. Hệ thống sẽ xác nhận lại chỗ giữ và trạng thái giao dịch trước khi chuyển.',
      nzOkText: 'Xác nhận', nzCancelText: 'Quay lại',
      nzOnOk: () => {
        this.loading.set(true);
        this.api.fallbackToClinic(context.appointmentId).pipe(finalize(() => this.loading.set(false))).subscribe({
          next: () => {
            this.clearPendingPaymentContext();
            this.navigateToPaymentResult(context.appointmentId);
          },
          error: (error) => this.errorMessage.set(this.errorText(error)),
        });
      },
    });
  }

  goToHistory(): void {
    void this.router.navigate(['/patient/history']);
  }

  resetBookingFlow(): void {
    if (this.pendingPaymentContext()) { this.startNewBooking(); return; }
    this.releaseReservation();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.recoveryActive.set(false);
    this.checkoutStatus.set(null);
    this.payAtClinicReceipt.set(null);
    this.clearPendingPaymentContext();
    this.bookingCommitted = false;
    this.reservationId = null;
    this.selectedSlotId.set(null);
    this.patientForm.reset();
    this.consentAccepted = false;
    this.consentError = false;
    this.step.set(1);
  }

  goToStep(step: number): void { if (!this.recoveryActive() && !this.loading()) this.step.set(step); }
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

  private checkPendingPayment(context: PendingPaymentContext, _initiateWhenPending: boolean): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.api.getPaymentStatus(context.appointmentId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (status) => {
        this.checkoutStatus.set(status);
        const terminal = status.appointmentStatus !== AppointmentStatus.PENDING_PAYMENT;
        if (terminal) {
          this.clearPendingPaymentContext();
          this.bookingCommitted = false;
          this.recoveryActive.set(false);
          this.step.set(1);
          this.message.info('Checkout trước đã kết thúc. Bạn có thể đặt lịch mới hoặc xem lịch sử.');
          return;
        }
        const selectedFollowedProvider = this.paymentMethod() === context.provider || !context.provider;
        const provider = status.provider === PaymentMethod.MOMO ? PaymentMethod.MOMO : PaymentMethod.VNPAY;
        const restored: PendingPaymentContext = { appointmentId: status.appointmentId, provider, idempotencyKey: status.idempotencyKey };
        this.persistPendingPaymentContext(restored);
        if (this.recoveryActive() && selectedFollowedProvider) this.paymentMethod.set(provider);
        if (status.transactionStatus === PaymentTransactionStatus.RECONCILIATION_REQUIRED ||
          status.paymentStatus === PaymentStatus.REFUND_PENDING) {
          this.errorMessage.set('Giao dịch đang được đối soát. Không thanh toán lại; hãy kiểm tra trạng thái hoặc liên hệ hỗ trợ.');
        }
      },
      error: (error) => {
        if (error instanceof HttpErrorResponse && [403, 404].includes(error.status)) {
          this.clearPendingPaymentContext();
          this.resetBookingFlow();
          this.message.info('Checkout cũ không còn khả dụng. Bạn có thể đặt lịch mới.');
          return;
        }
        this.errorMessage.set(this.errorText(error));
      },
    });
  }

  private initiateOnlinePayment(
    context: PendingPaymentContext,
    supersedeActive = false,
  ): void {
    if (this.loading()) return;
    if (!context.provider || !context.idempotencyKey) {
      this.errorMessage.set('Chưa xác minh được giao dịch. Vui lòng kiểm tra lại trạng thái.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    const payment$ = supersedeActive
      ? this.api.initiatePayment(context.appointmentId, context.provider, context.idempotencyKey, true)
      : this.api.initiatePayment(context.appointmentId, context.provider, context.idempotencyKey);

    payment$.pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (payment) => {
        sessionStorage.setItem('pendingPaymentAppointmentId', context.appointmentId);
        try {
          this.paymentRedirect.redirect(payment.paymentUrl);
        } catch {
          this.errorMessage.set('Cổng thanh toán trả về địa chỉ không an toàn.');
        }
      },
      error: (error) => {
        this.errorMessage.set(this.errorText(error));
        this.loading.set(false);
        this.checkPendingPayment(context, false);
      },
    });
  }

  private persistPendingPaymentContext(context: PendingPaymentContext): void {
    this.pendingPaymentContext.set(context);
    sessionStorage.setItem(PENDING_PAYMENT_CONTEXT_KEY, JSON.stringify({ appointmentId: context.appointmentId }));
    sessionStorage.setItem('pendingPaymentAppointmentId', context.appointmentId);
  }

  private readPendingPaymentContext(): PendingPaymentContext | null {
    try {
      const raw = sessionStorage.getItem(PENDING_PAYMENT_CONTEXT_KEY);
      const legacy = sessionStorage.getItem('pendingPaymentAppointmentId');
      const appointmentId: unknown = raw ? JSON.parse(raw).appointmentId : legacy;
      if (typeof appointmentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appointmentId)) return null;
      return { appointmentId };
    } catch {
      return null;
    }
  }

  private clearPendingPaymentContext(): void {
    this.pendingPaymentContext.set(null);
    this.idempotencyKey = null;
    sessionStorage.removeItem(PENDING_PAYMENT_CONTEXT_KEY);
    sessionStorage.removeItem('pendingPaymentAppointmentId');
  }

  private navigateToPaymentResult(appointmentId: string): void {
    void this.router.navigate(['/patient/payment-result'], {
      queryParams: { appointmentId },
    });
  }

  private errorText(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const messages: Record<string, string> = {
        MOMO_CONFIGURATION_ERROR: 'MoMo chưa khả dụng do cấu hình tài khoản doanh nghiệp. Vui lòng chọn VNPay hoặc thanh toán tại bệnh viện.',
        PAYMENT_RECONCILIATION_REQUIRED: 'Giao dịch đang đối soát. Không thanh toán lại; hãy kiểm tra trạng thái.',
        RESERVATION_EXPIRED: 'Chỗ giữ đã hết hạn. Hãy kiểm tra checkout trước khi đặt lịch mới.',
        PROVIDER_REJECTED: 'Cổng thanh toán đã từ chối lần thử này. Hãy kiểm tra checkout để chọn cách khôi phục.',
      };
      if (messages[error.error?.code]) return messages[error.error.code];
      if (error.status === 0) return 'Mất kết nối. Checkout vẫn được giữ; hãy thử kiểm tra trạng thái khi có mạng.';
      const message = error.error?.message;
      return Array.isArray(message) ? message.join(' ') : message || 'Không thể xử lý yêu cầu.';
    }
    return 'Không thể xử lý yêu cầu.';
  }
}
