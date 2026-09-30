import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@shared/enums';
import { of, throwError } from 'rxjs';
import { PatientBookingApiService, PatientDoctorDetail } from '../../data-access/patient-booking-api.service';
import { PaymentRedirectService } from '../../data-access/payment-redirect.service';
import { BookingStepperPage } from './booking-stepper.page';

describe('BookingStepperPage payment flow', () => {
  const doctorId = '11111111-1111-4111-8111-111111111111';
  const slotId = '22222222-2222-4222-8222-222222222222';
  const reservationId = '33333333-3333-4333-8333-333333333333';
  const appointmentId = '44444444-4444-4444-8444-444444444444';
  const doctor: PatientDoctorDetail = {
    id: doctorId,
    fullName: 'Nguyễn Văn An',
    academicTitle: 'BS.CKI',
    specialty: { id: 'specialty-id', name: 'Tim mạch' },
    consultationFee: 350_000,
    bioDescription: null,
    roomNumber: '101',
    ratingAverage: 4.9,
    availableSchedules: [{
      id: slotId,
      doctorId,
      date: '2026-10-10',
      startTime: '08:00:00',
      endTime: '08:30:00',
      status: 'AVAILABLE',
    }],
  };

  let fixture: ComponentFixture<BookingStepperPage>;
  let component: BookingStepperPage;
  let api: jasmine.SpyObj<PatientBookingApiService>;
  let router: jasmine.SpyObj<Router>;
  let redirect: jasmine.SpyObj<PaymentRedirectService>;
  let modal: jasmine.SpyObj<NzModalService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', [
      'searchDoctors', 'getDoctor', 'reserveSlot', 'releaseSlot', 'confirmBooking', 'initiatePayment',
      'getPaymentStatus', 'getVouchers', 'validateVoucher', 'cancelAppointment', 'cancelPendingPayment', 'fallbackToClinic',
    ]);
    api.searchDoctors.and.returnValue(of({
      data: [doctor],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
    api.getDoctor.and.returnValue(of(doctor));
    api.getVouchers.and.returnValue(of([]));
    api.cancelAppointment.and.returnValue(of({ success: true, message: 'ok' }));
    api.cancelPendingPayment.and.returnValue(of({ appointmentId, appointmentStatus: AppointmentStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED }));
    api.fallbackToClinic.and.returnValue(of({ appointmentId }));
    api.reserveSlot.and.returnValue(of({
      success: true,
      message: 'ok',
      data: { doctorId, slotId, reservationId, expiresAt: new Date().toISOString(), ttlSeconds: 600 },
    }));
    api.releaseSlot.and.returnValue(of({ success: true, message: 'ok' }));
    api.confirmBooking.and.returnValue(of({
      id: appointmentId,
      appointmentCode: 'APT-01',
      patientId: 'patient-id',
      doctorId,
      scheduleId: slotId,
      status: AppointmentStatus.PENDING_PAYMENT,
      reasonForVisit: 'Khám định kỳ',
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.MOMO,
      totalAmount: 350_000,
    }));
    api.initiatePayment.and.returnValue(of({
      transactionId: 'payment-id',
      appointmentId,
      provider: PaymentMethod.MOMO,
      merchantTransactionId: 'PAY01',
      paymentUrl: 'https://test-payment.momo.vn/pay',
      expiresAt: new Date().toISOString(),
    }));
    api.getPaymentStatus.and.returnValue(of({
      appointmentId,
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.PENDING,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
      canRetry: true, canSwitchProvider: true, canFallbackToClinic: false,
      expiresAt: new Date().toISOString(),
      paidAt: null,
    }));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    redirect = jasmine.createSpyObj<PaymentRedirectService>('PaymentRedirectService', ['redirect']);
    modal = jasmine.createSpyObj<NzModalService>('NzModalService', ['confirm']);

    await TestBed.configureTestingModule({
      imports: [BookingStepperPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        { provide: PaymentRedirectService, useValue: redirect },
        { provide: NzModalService, useValue: modal },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).overrideProvider(NzModalService, { useValue: modal }).compileComponents();

    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.clear();
    fixture.destroy();
  });

  it('loads real doctor schedules and reserves the selected slot', fakeAsync(() => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    tick(1_000);

    expect(api.getDoctor).toHaveBeenCalledWith(doctorId);
    expect(api.reserveSlot).toHaveBeenCalledWith({ doctorId, slotId });
    expect(component.selectedSlotId()).toBe(slotId);
    expect(component.countdownSeconds()).toBe(599);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it('maps held and booked schedules as unavailable and counts only available slots', () => {
    api.getDoctor.and.returnValue(of({
      ...doctor,
      availableSchedules: [
        doctor.availableSchedules[0],
        { ...doctor.availableSchedules[0], id: 'held-slot', startTime: '09:00:00', status: 'HOLDING' },
        { ...doctor.availableSchedules[0], id: 'booked-slot', startTime: '10:00:00', status: 'BOOKED' },
      ],
    }));

    component.selectDoctorAndContinue(component.doctors()[0]);

    expect(component.days[0].slotsCount).toBe(1);
    expect(component.morningSlots.map((slot) => slot.status)).toEqual([
      'available',
      'holding',
      'booked',
    ]);
    component.chooseSlot(component.morningSlots[1]);
    expect(api.reserveSlot).not.toHaveBeenCalled();
  });

  it('confirms booking, creates one idempotent payment, and redirects to MoMo', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.MOMO);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(api.confirmBooking).toHaveBeenCalledWith(jasmine.objectContaining({
      doctorId, slotId, reservationId, paymentMethod: PaymentMethod.MOMO,
    }));
    const initiateArgs = api.initiatePayment.calls.mostRecent().args;
    expect(initiateArgs[0]).toBe(appointmentId);
    expect(initiateArgs[1]).toBe(PaymentMethod.MOMO);
    expect(initiateArgs[2]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(redirect.redirect).toHaveBeenCalledWith('https://test-payment.momo.vn/pay');
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBe(appointmentId);
  });

  it('confirms booking for pay-at-clinic and displays confirmation receipt instead of navigating away immediately', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.PAY_AT_CLINIC);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(component.payAtClinicReceipt()).toBeTruthy();
    expect(component.payAtClinicReceipt()?.appointmentCode).toBe('APT-01');
    expect(router.navigate).not.toHaveBeenCalled();

    component.goToHistory();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/history']);
  });

  function reloadCheckout(): void {
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({ appointmentId, provider: PaymentMethod.MOMO, idempotencyKey: 'untrusted-old-key' }));
    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function acceptModal(): void {
    const config = modal.confirm.calls.mostRecent().args[0];
    if (typeof config?.nzOnOk === 'function') (config.nzOnOk as () => void)();
  }

  it('stores only the appointment ID and never hijacks a new booking on reload', () => {
    reloadCheckout();
    expect(component.step()).toBe(1);
    expect(component.recoveryActive()).toBeFalse();
    expect(JSON.parse(sessionStorage.getItem('pendingPaymentContext')!)).toEqual({ appointmentId });
    component.submitBooking();
    expect(api.confirmBooking).not.toHaveBeenCalled();
    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('restores provider and idempotency from backend only after explicit recovery', () => {
    reloadCheckout();
    component.retryPendingPayment();
    expect(component.step()).toBe(4);
    expect(component.paymentMethod()).toBe(PaymentMethod.VNPAY);
    component.submitBooking();
    expect(api.initiatePayment).toHaveBeenCalledWith(appointmentId, PaymentMethod.VNPAY, '55555555-5555-4555-8555-555555555555');
    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  it('switches provider only after confirmation with a new key', () => {
    reloadCheckout();
    component.retryPendingPayment();
    component.selectPayment(PaymentMethod.MOMO);
    component.submitBooking();
    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(modal.confirm).toHaveBeenCalled();
    acceptModal();
    expect(api.initiatePayment).toHaveBeenCalledWith(appointmentId, PaymentMethod.MOMO, jasmine.any(String), true);
    expect(api.initiatePayment.calls.mostRecent().args[2]).not.toBe('55555555-5555-4555-8555-555555555555');
  });

  it('preserves context when cancellation fails and uses the payment-aware endpoint', () => {
    reloadCheckout();
    api.cancelPendingPayment.and.returnValue(throwError(() => new Error('offline')));
    component.cancelPendingPayment();
    expect(api.cancelPendingPayment).not.toHaveBeenCalled();
    acceptModal();
    expect(api.cancelAppointment).not.toHaveBeenCalled();
    expect(component.pendingPaymentContext()?.appointmentId).toBe(appointmentId);
    expect(sessionStorage.getItem('pendingPaymentContext')).not.toBeNull();
    expect(component.errorMessage()).toBeTruthy();
  });

  it('starts a new booking only after confirmed cancellation', () => {
    reloadCheckout();
    component.startNewBooking();
    expect(component.pendingPaymentContext()).not.toBeNull();
    acceptModal();
    expect(api.cancelPendingPayment).toHaveBeenCalledWith(appointmentId);
    expect(component.pendingPaymentContext()).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
    expect(component.step()).toBe(1);
  });

  it('keeps a FAILED attempt recoverable and retries with a fresh key', () => {
    reloadCheckout();
    api.getPaymentStatus.and.returnValue(of({
      appointmentId, appointmentStatus: AppointmentStatus.PENDING_PAYMENT, paymentStatus: PaymentStatus.FAILED,
      provider: PaymentMethod.VNPAY, transactionStatus: PaymentTransactionStatus.FAILED,
      idempotencyKey: 'failed-key', canRetry: true, canSwitchProvider: true, canFallbackToClinic: true, expiresAt: null, paidAt: null,
    }));
    component.retryPendingPayment();
    expect(component.pendingPaymentContext()).not.toBeNull();
    component.submitBooking();
    expect(api.initiatePayment).toHaveBeenCalledWith(appointmentId, PaymentMethod.VNPAY, jasmine.any(String));
    expect(api.initiatePayment.calls.mostRecent().args[2]).not.toBe('failed-key');
  });

  it('shows a configuration message and keeps clinic recovery after MoMo code 13', () => {
    api.getPaymentStatus.and.returnValue(of({
      appointmentId, appointmentStatus: AppointmentStatus.PENDING_PAYMENT, paymentStatus: PaymentStatus.FAILED,
      provider: PaymentMethod.MOMO, transactionStatus: PaymentTransactionStatus.FAILED,
      canRetry: true, canSwitchProvider: true, canFallbackToClinic: true, expiresAt: null, paidAt: null,
    }));
    api.initiatePayment.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 502, error: { code: 'MOMO_CONFIGURATION_ERROR' },
    })));
    reloadCheckout();
    component.retryPendingPayment();
    component.submitBooking();
    expect(component.errorMessage()).toContain('cấu hình tài khoản doanh nghiệp');
    expect(component.canFallback()).toBeTrue();
    expect(component.pendingPaymentContext()?.appointmentId).toBe(appointmentId);
    component.selectPayment(PaymentMethod.PAY_AT_CLINIC);
    expect(component.paymentMethod()).toBe(PaymentMethod.PAY_AT_CLINIC);
  });

  it('blocks repayment while reconciliation is required', () => {
    reloadCheckout();
    api.getPaymentStatus.and.returnValue(of({
      appointmentId, appointmentStatus: AppointmentStatus.PENDING_PAYMENT, paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.VNPAY, transactionStatus: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      canRetry: false, canSwitchProvider: false, canFallbackToClinic: false, expiresAt: null, paidAt: null,
    }));
    component.retryPendingPayment();
    component.selectPayment(PaymentMethod.MOMO);
    component.submitBooking();
    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(component.pendingPaymentContext()).not.toBeNull();
  });

  it('clears only backend-confirmed terminal context without navigating to an old result', () => {
    api.getPaymentStatus.and.returnValue(of({
      appointmentId, appointmentStatus: AppointmentStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED,
      provider: PaymentMethod.VNPAY, transactionStatus: PaymentTransactionStatus.FAILED, expiresAt: null, paidAt: null,
    }));
    reloadCheckout();
    expect(component.pendingPaymentContext()).toBeNull();
    expect(component.step()).toBe(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps the context after status API errors', () => {
    api.getPaymentStatus.and.returnValue(throwError(() => new Error('offline')));
    reloadCheckout();
    expect(component.pendingPaymentContext()?.appointmentId).toBe(appointmentId);
    expect(sessionStorage.getItem('pendingPaymentContext')).not.toBeNull();
    expect(api.initiatePayment).not.toHaveBeenCalled();
  });

  [403, 404].forEach(status => {
    it(`clears an inaccessible checkout pointer after HTTP ${status}`, () => {
      reloadCheckout();
      api.getPaymentStatus.and.returnValue(throwError(() => new HttpErrorResponse({ status })));
      component.retryPendingPayment();
      expect(component.pendingPaymentContext()).toBeNull();
      expect(component.recoveryActive()).toBeFalse();
      expect(component.step()).toBe(1);
      expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
      expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBeNull();
      component.startNewBooking();
      expect(api.cancelPendingPayment).not.toHaveBeenCalled();
    });
  });

  [0, 503].forEach(status => {
    it(`preserves an uncertain checkout after HTTP ${status}`, () => {
      api.getPaymentStatus.and.returnValue(throwError(() => new HttpErrorResponse({ status })));
      reloadCheckout();
      expect(component.pendingPaymentContext()?.appointmentId).toBe(appointmentId);
      expect(sessionStorage.getItem('pendingPaymentContext')).not.toBeNull();
    });
  });

  it('requires consent before creating the appointment', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(component.consentError).toBeTrue();
    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  it('loads vouchers and uses the backend validation discount', () => {
    api.getVouchers.calls.reset();
    api.getVouchers.and.returnValue(of([{
      id: 'voucher-id',
      code: 'COMPENSATE-20',
      discountPercent: 20,
      isUsed: false,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }]));
    api.validateVoucher.and.returnValue(of({
      code: 'COMPENSATE-20',
      discountPercent: 20,
      discountAmount: 70_000,
      finalAmount: 280_000,
    }));

    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.applyVoucher('compensate-20');

    expect(component.vouchers().map((voucher) => voucher.code)).toEqual(['COMPENSATE-20']);
    expect(api.validateVoucher).toHaveBeenCalledWith('COMPENSATE-20', 350_000);
    expect(component.discountAmount()).toBe(70_000);
    expect(component.payableAmount()).toBe(280_000);
  });
});
