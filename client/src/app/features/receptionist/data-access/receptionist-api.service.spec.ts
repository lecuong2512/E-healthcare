import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CounterPaymentMethod, Gender } from '@shared/enums';
import { ReceptionistApiService } from './receptionist-api.service';

describe('ReceptionistApiService', () => {
  let service: ReceptionistApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReceptionistApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ReceptionistApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends exactly one appointment lookup criterion', () => {
    service.lookupAppointments({ code: 'APT-260924-0001' }).subscribe();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === '/api/v1/reception/appointments/lookup' &&
        candidate.params.get('code') === 'APT-260924-0001' &&
        !candidate.params.has('phone'),
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('keeps the signed QR token in the request body', () => {
    service.lookupQr('signed-token').subscribe();

    const request = http.expectOne('/api/v1/reception/qr/lookup');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ qrToken: 'signed-token' });
    request.flush({});
  });

  it('sends the canonical cash payment contract', () => {
    service
      .collectPayment('appointment-1', {
        method: CounterPaymentMethod.CASH,
        amountTendered: 400_000,
      })
      .subscribe();

    const request = http.expectOne(
      '/api/v1/reception/appointments/appointment-1/collect-payment',
    );
    expect(request.request.body).toEqual({
      method: CounterPaymentMethod.CASH,
      amountTendered: 400_000,
    });
    request.flush({});
  });

  it('attaches the walk-in idempotency key without placing it in the URL', () => {
    service
      .createWalkIn(
        {
          scheduleId: '11111111-1111-4111-8111-111111111111',
          fullName: 'Nguyễn Văn An',
          phone: '0912345678',
          birthYear: 1990,
          gender: Gender.MALE,
          reasonForVisit: 'Đau ngực',
          paymentMethod: CounterPaymentMethod.CASH,
          amountTendered: 400_000,
        },
        '22222222-2222-4222-8222-222222222222',
      )
      .subscribe();

    const request = http.expectOne('/api/v1/reception/walk-in');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(request.request.url).not.toContain('22222222');
    request.flush({});
  });

  it('loads the authoritative reception queue snapshot', () => {
    service.getQueue().subscribe();

    const request = http.expectOne('/api/v1/reception/queue');
    expect(request.request.method).toBe('GET');
    request.flush({ scope: 'RECEPTION', date: '2026-09-24', items: [] });
  });

  it('issues a short-lived token for the public queue board', () => {
    service.issueQueueBoardToken().subscribe();

    const request = http.expectOne('/api/v1/reception/queue/board-token');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ token: 'board-token', expiresAt: '2026-09-25T00:00:00Z' });
  });
});
