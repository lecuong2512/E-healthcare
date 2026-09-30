import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '../services/notification.service';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let notifications: jasmine.SpyObj<NotificationService>;

  beforeEach(() => {
    notifications = jasmine.createSpyObj<NotificationService>('NotificationService', [
      'error',
      'warning',
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notifications },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('leaves doctor review business errors to the feature page', () => {
    http.post('/api/v1/doctors/doctor-id/reviews', {}).subscribe({ error: () => undefined });
    httpMock.expectOne('/api/v1/doctors/doctor-id/reviews').flush(
      { message: 'Ca khám này đã được đánh giá.' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(notifications.warning).not.toHaveBeenCalled();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('keeps global conflict notification for other endpoints', () => {
    http.post('/api/v1/bookings', {}).subscribe({ error: () => undefined });
    httpMock.expectOne('/api/v1/bookings').flush(
      { message: 'Khung giờ đã được giữ.' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(notifications.warning).toHaveBeenCalledOnceWith('Khung giờ đã được giữ.');
  });
});
