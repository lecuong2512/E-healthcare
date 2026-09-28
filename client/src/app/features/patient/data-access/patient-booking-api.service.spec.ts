import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PaymentMethod } from '@shared/enums';
import { PatientBookingApiService } from './patient-booking-api.service';

describe('PatientBookingApiService', () => {
  let service: PatientBookingApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PatientBookingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only provider and the idempotency header when initiating payment', () => {
    service.initiatePayment('appointment-id', PaymentMethod.VNPAY, 'idempotency-id').subscribe();

    const request = http.expectOne('/api/v1/payments/appointment-id/initiate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ provider: PaymentMethod.VNPAY });
    expect(request.request.headers.get('Idempotency-Key')).toBe('idempotency-id');
    expect(request.request.body.amount).toBeUndefined();
    expect(request.request.body.returnUrl).toBeUndefined();
    expect(request.request.body.ipnUrl).toBeUndefined();
    request.flush({});
  });
});
