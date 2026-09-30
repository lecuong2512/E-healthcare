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

  it('requests the first 50 doctors for booking', () => {
    service.searchDoctors().subscribe();

    const request = http.expectOne((req) => req.url === '/api/v1/doctors/search');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('limit')).toBe('50');
    request.flush({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
  });

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

  it('asks the server for doctors with bookable slots on the supplied day', () => {
    service.searchDoctors('2026-10-01').subscribe();
    const request = http.expectOne(req => req.url === '/api/v1/doctors/search');
    expect(request.request.params.get('date')).toBe('2026-10-01');
    request.flush({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
  });

  it('loads and validates vouchers through the appointment APIs', () => {
    service.getVouchers().subscribe();
    const listRequest = http.expectOne('/api/v1/appointments/me/vouchers');
    expect(listRequest.request.method).toBe('GET');
    listRequest.flush([]);

    service.validateVoucher('COMPENSATE-20', 350_000).subscribe();
    const validationRequest = http.expectOne((request) =>
      request.url === '/api/v1/appointments/vouchers/validate' &&
      request.params.get('code') === 'COMPENSATE-20' &&
      request.params.get('totalAmount') === '350000',
    );
    expect(validationRequest.request.method).toBe('GET');
    validationRequest.flush({});
  });

  it('uses payment-aware cancellation and clinic fallback APIs', () => {
    service.cancelPendingPayment('appointment-id').subscribe();
    const cancel = http.expectOne('/api/v1/payments/appointment-id/cancel-pending');
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({});
    cancel.flush({});
    service.fallbackToClinic('appointment-id').subscribe();
    const fallback = http.expectOne('/api/v1/payments/appointment-id/fallback-to-clinic');
    expect(fallback.request.method).toBe('POST');
    expect(fallback.request.body).toEqual({});
    fallback.flush({});
  });
});
