import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentStatus, PaymentMethod, PaymentStatus } from '@shared/enums';
import { of } from 'rxjs';
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
    ]);
    api.searchDoctors.and.returnValue(of({
      data: [doctor],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
    api.getDoctor.and.returnValue(of(doctor));
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
});
