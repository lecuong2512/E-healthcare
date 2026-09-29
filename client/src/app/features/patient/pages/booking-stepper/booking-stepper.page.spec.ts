import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
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

  beforeEach(async () => {
    api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', [
      'searchDoctors', 'getDoctor', 'reserveSlot', 'releaseSlot', 'confirmBooking', 'initiatePayment',
      'getPaymentStatus', 'getVouchers', 'validateVoucher',
    ]);
    api.searchDoctors.and.returnValue(of({
      data: [doctor],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
    api.getDoctor.and.returnValue(of(doctor));
    api.getVouchers.and.returnValue(of([]));
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
      expiresAt: new Date().toISOString(),
      paidAt: null,
    }));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    redirect = jasmine.createSpyObj<PaymentRedirectService>('PaymentRedirectService', ['redirect']);

    await TestBed.configureTestingModule({
      imports: [BookingStepperPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        { provide: PaymentRedirectService, useValue: redirect },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

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

  it('does not call payment initiation for pay-at-clinic', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.PAY_AT_CLINIC);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/history']);
  });

  it('retries payment initiation without confirming the booking again', () => {
    api.initiatePayment.and.returnValues(
      throwError(() => new Error('network failure')),
      of({
        transactionId: 'payment-id',
        appointmentId,
        provider: PaymentMethod.MOMO,
        merchantTransactionId: 'PAY01',
        paymentUrl: 'https://test-payment.momo.vn/pay',
        expiresAt: new Date().toISOString(),
      }),
    );
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.MOMO);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();
    const firstKey = api.initiatePayment.calls.mostRecent().args[2];
    component.submitBooking();

    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(api.initiatePayment).toHaveBeenCalledTimes(2);
    expect(api.initiatePayment.calls.mostRecent().args).toEqual([
      appointmentId,
      PaymentMethod.MOMO,
      firstKey,
    ]);
    expect(redirect.redirect).toHaveBeenCalledWith('https://test-payment.momo.vn/pay');
  });

  it('recovers a pending payment context after the page reloads', () => {
    const idempotencyKey = '55555555-5555-4555-8555-555555555555';
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
      appointmentId,
      provider: PaymentMethod.VNPAY,
      idempotencyKey,
    }));
    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.step()).toBe(4);
    expect(api.getPaymentStatus).toHaveBeenCalledWith(appointmentId);
    component.retryPendingPayment();

    expect(api.confirmBooking).not.toHaveBeenCalled();
    expect(api.initiatePayment).toHaveBeenCalledWith(
      appointmentId,
      PaymentMethod.VNPAY,
      idempotencyKey,
    );
  });

  [
    PaymentTransactionStatus.SUCCESS,
    PaymentTransactionStatus.RECONCILIATION_REQUIRED,
    PaymentTransactionStatus.LATE_SUCCESS,
  ].forEach((transactionStatus) => {
    it(`routes a recovered ${transactionStatus} payment to its result`, () => {
      sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
        appointmentId,
        provider: PaymentMethod.VNPAY,
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      }));
      api.getPaymentStatus.and.returnValue(of({
        appointmentId,
        appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        provider: PaymentMethod.VNPAY,
        transactionStatus,
        expiresAt: new Date().toISOString(),
        paidAt: null,
      }));

      fixture.destroy();
      fixture = TestBed.createComponent(BookingStepperPage);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(api.initiatePayment).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/patient/payment-result'], {
        queryParams: { appointmentId },
      });
    });
  });

  it('clears a recovered terminal payment before routing to its result', () => {
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
      appointmentId,
      provider: PaymentMethod.VNPAY,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    }));
    sessionStorage.setItem('pendingPaymentAppointmentId', appointmentId);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId,
      appointmentStatus: AppointmentStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.FAILED,
      expiresAt: new Date().toISOString(),
      paidAt: null,
    }));

    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.pendingPaymentContext()).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBeNull();
    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/payment-result'], {
      queryParams: { appointmentId },
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
