import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentTransactionStatus } from '@shared/enums';
import { of, throwError } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';
import { PaymentResultPage } from './payment-result.page';

describe('PaymentResultPage', () => {
  afterEach(() => sessionStorage.clear());

  it('keeps a failed attempt recoverable while its appointment is pending', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(of({ appointmentId: 'appointment-id', appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.FAILED, provider: PaymentMethod.VNPAY, transactionStatus: PaymentTransactionStatus.FAILED,
      canRetry: true, canFallbackToClinic: true, expiresAt: null, paidAt: null }));
    TestBed.configureTestingModule({ imports: [PaymentResultPage, NoopAnimationsModule], providers: [
      { provide: PatientBookingApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'appointment-id' } } } },
    ] });
    sessionStorage.setItem('pendingPaymentContext', '{"appointmentId":"appointment-id"}');
    const fixture = TestBed.createComponent(PaymentResultPage);
    tick();
    expect(fixture.componentInstance.state()).toBe('recoverable');
    expect(sessionStorage.getItem('pendingPaymentContext')).not.toBeNull();
    fixture.destroy();
  }));

  it('stops polling and sets recoverable state when user cancelled on MoMo (resultCode 1006)', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus', 'fallbackToClinic', 'cancelPendingPayment']);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId: 'apt-momo',
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.MOMO,
      transactionStatus: PaymentTransactionStatus.PENDING,
      canRetry: true,
      canFallbackToClinic: true,
      expiresAt: null,
      paidAt: null,
    }));
    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => {
                  if (key === 'appointmentId') return 'apt-momo';
                  if (key === 'resultCode') return '1006';
                  return null;
                },
              },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(PaymentResultPage);
    tick();
    expect(fixture.componentInstance.isUserCancelled()).toBeTrue();
    expect(fixture.componentInstance.state()).toBe('recoverable');
    // Only 1 status call should have been made, not continuous timer polling
    expect(api.getPaymentStatus.calls.count()).toBe(1);
    tick(5000);
    expect(api.getPaymentStatus.calls.count()).toBe(1);
    fixture.destroy();
  }));

  it('stops polling and sets recoverable state when user cancelled on VNPAY (vnp_ResponseCode 24)', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId: 'apt-vnpay',
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.PENDING,
      canRetry: true,
      canFallbackToClinic: true,
      expiresAt: null,
      paidAt: null,
    }));
    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => {
                  if (key === 'appointmentId') return 'apt-vnpay';
                  if (key === 'vnp_ResponseCode') return '24';
                  return null;
                },
              },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(PaymentResultPage);
    tick();
    expect(fixture.componentInstance.isUserCancelled()).toBeTrue();
    expect(fixture.componentInstance.state()).toBe('recoverable');
    fixture.destroy();
  }));

  it('transitions to recoverable after 3 polls when transaction remains PENDING and canRetry is true', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId: 'apt-pending',
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.PENDING,
      canRetry: true,
      canFallbackToClinic: true,
      expiresAt: null,
      paidAt: null,
    }));
    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => key === 'appointmentId' ? 'apt-pending' : null,
              },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(PaymentResultPage);
    // Poll 1 at 0ms
    tick(0);
    expect(fixture.componentInstance.state()).toBe('loading');
    // Poll 2 at 2000ms
    tick(2000);
    expect(fixture.componentInstance.state()).toBe('loading');
    // Poll 3 at 4000ms -> should transition to recoverable
    tick(2000);
    expect(fixture.componentInstance.state()).toBe('recoverable');

    // Polling should have terminated
    const countAfter3 = api.getPaymentStatus.calls.count();
    tick(10000);
    expect(api.getPaymentStatus.calls.count()).toBe(countAfter3);
    fixture.destroy();
  }));

  it('does not clear a newer checkout when showing an older completed result', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(of({ appointmentId: 'old-id', appointmentStatus: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID, provider: PaymentMethod.VNPAY, transactionStatus: PaymentTransactionStatus.SUCCESS, expiresAt: null, paidAt: null }));
    TestBed.configureTestingModule({ imports: [PaymentResultPage, NoopAnimationsModule], providers: [
      { provide: PatientBookingApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'old-id' } } } },
    ] });
    sessionStorage.setItem('pendingPaymentContext', '{"appointmentId":"new-id"}');
    sessionStorage.setItem('pendingPaymentAppointmentId', 'new-id');
    const fixture = TestBed.createComponent(PaymentResultPage);
    tick();
    expect(fixture.componentInstance.state()).toBe('success');
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBe('new-id');
    expect(JSON.parse(sessionStorage.getItem('pendingPaymentContext')!).appointmentId).toBe('new-id');
    fixture.destroy();
  }));

  it('retains context when status polling fails', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValue(throwError(() => new Error('offline')));
    TestBed.configureTestingModule({ imports: [PaymentResultPage, NoopAnimationsModule], providers: [
      { provide: PatientBookingApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'appointment-id' } } } },
    ] });
    sessionStorage.setItem('pendingPaymentContext', '{"appointmentId":"appointment-id"}');
    const fixture = TestBed.createComponent(PaymentResultPage);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
    expect(sessionStorage.getItem('pendingPaymentContext')).not.toBeNull();
    fixture.destroy();
  }));

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

  it('clears terminal appointment context even when its transaction needs reconciliation', fakeAsync(() => {
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
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
  }));

  it('handles VNPAY success with merchantTransactionId (vnp_TxnRef) without dropping to error', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus']);
    api.getPaymentStatus.and.returnValues(
      // First poll: still PENDING
      of({
        appointmentId: 'resolved-uuid-123',
        appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        provider: PaymentMethod.VNPAY,
        transactionStatus: PaymentTransactionStatus.PENDING,
        canRetry: true,
        canFallbackToClinic: true,
        expiresAt: null,
        paidAt: null,
      }),
      // Second poll: IPN finalized -> SUCCESS
      of({
        appointmentId: 'resolved-uuid-123',
        appointmentStatus: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        provider: PaymentMethod.VNPAY,
        transactionStatus: PaymentTransactionStatus.SUCCESS,
        expiresAt: null,
        paidAt: new Date().toISOString(),
      }),
    );
    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => {
                  if (key === 'vnp_ResponseCode') return '00';
                  if (key === 'vnp_TxnRef') return 'PAY20261001ABCDEF';
                  return null;
                },
              },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(PaymentResultPage);
    tick(0);
    expect(fixture.componentInstance.isGatewaySuccess()).toBeTrue();
    expect(fixture.componentInstance.state()).toBe('loading');

    // Poll 2 at 2000ms
    tick(2000);
    expect(fixture.componentInstance.state()).toBe('success');
    expect(fixture.componentInstance.resolvedAppointmentId()).toBe('resolved-uuid-123');
    fixture.destroy();
  }));

  it('transitions to cancelled state when cancelPendingPayment succeeds for orderId PAY...', fakeAsync(() => {
    const api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', ['getPaymentStatus', 'cancelPendingPayment']);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId: 'resolved-uuid-momo',
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.MOMO,
      transactionStatus: PaymentTransactionStatus.PENDING,
      canRetry: true,
      canFallbackToClinic: true,
      expiresAt: null,
      paidAt: null,
    }));
    api.cancelPendingPayment.and.returnValue(of({
      appointmentId: 'resolved-uuid-momo',
      appointmentStatus: AppointmentStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
    }));

    TestBed.configureTestingModule({
      imports: [PaymentResultPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => {
                  if (key === 'resultCode') return '1006';
                  if (key === 'orderId') return 'PAY20261001MOMO';
                  return null;
                },
              },
            },
          },
        },
      ],
    });

    sessionStorage.setItem('pendingPaymentAppointmentId', 'PAY20261001MOMO');
    const fixture = TestBed.createComponent(PaymentResultPage);
    tick(0);
    expect(fixture.componentInstance.isUserCancelled()).toBeTrue();
    expect(fixture.componentInstance.state()).toBe('recoverable');

    fixture.componentInstance.cancelPendingPayment();
    tick();
    expect(api.cancelPendingPayment).toHaveBeenCalledWith('resolved-uuid-momo');
    expect(fixture.componentInstance.state()).toBe('cancelled');
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBeNull();
    fixture.destroy();
  }));
});
