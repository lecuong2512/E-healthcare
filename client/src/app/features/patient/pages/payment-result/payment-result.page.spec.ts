import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentTransactionStatus } from '@shared/enums';
import { of } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';
import { PaymentResultPage } from './payment-result.page';

describe('PaymentResultPage', () => {
  afterEach(() => sessionStorage.clear());

  it('shows success only from the ownership-safe backend status', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId: 'appointment-id',
      appointmentStatus: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.SUCCESS,
      expiresAt: null,
      paidAt: new Date().toISOString(),
    }));
    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'appointment-id' } } } },
      ],
    }).compileComponents();

    sessionStorage.setItem('pendingPaymentAppointmentId', 'appointment-id');
    sessionStorage.setItem('pendingPaymentContext', '{"appointmentId":"appointment-id"}');
    const fixture = TestBed.createComponent(PaymentResultPage);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.state()).toBe('success');
    expect(api.getPaymentStatus).toHaveBeenCalledWith('appointment-id');
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
  }));

  it('keeps the pending appointment in session storage while reconciliation is required', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId: 'appointment-id',
      appointmentStatus: AppointmentStatus.EXPIRED,
      paymentStatus: PaymentStatus.REFUND_PENDING,
      provider: PaymentMethod.MOMO,
      transactionStatus: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
      expiresAt: null,
      paidAt: null,
    }));
    sessionStorage.setItem('pendingPaymentAppointmentId', 'appointment-id');
    sessionStorage.setItem('pendingPaymentContext', '{"appointmentId":"appointment-id"}');
    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaymentResultPage);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.state()).toBe('warning');
    expect(api.getPaymentStatus).toHaveBeenCalledWith('appointment-id');
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBe('appointment-id');
    expect(sessionStorage.getItem('pendingPaymentContext')).not.toBeNull();
  }));
});
