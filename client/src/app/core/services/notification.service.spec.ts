import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let events: Subject<NavigationStart>;
  let service: NotificationService;

  beforeEach(() => {
    events = new Subject();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events } }] });
    service = TestBed.inject(NotificationService);
  });

  it('automatically dismisses messages after five seconds', fakeAsync(() => {
    service.error('Lỗi thanh toán');
    expect(service.messages().length).toBe(1);
    tick(5000);
    expect(service.messages()).toEqual([]);
  }));

  it('dismisses messages and cancels timers when navigating', fakeAsync(() => {
    service.warning('Khung giờ đã được giữ');
    events.next(new NavigationStart(1, '/patient/history'));
    expect(service.messages()).toEqual([]);
    service.success('Thông báo mới');
    tick(5000);
    expect(service.messages()).toEqual([]);
  }));
});
