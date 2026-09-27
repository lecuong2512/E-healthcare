import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MedicalHistoryPage } from './medical-history.page';
import { TokenStoreService } from '../../../../core/services/token-store.service';

describe('MedicalHistoryPage', () => {
  let component: MedicalHistoryPage;
  let fixture: ComponentFixture<MedicalHistoryPage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MedicalHistoryPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: TokenStoreService,
          useValue: {
            accessToken: () => 'fake-jwt-token',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MedicalHistoryPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    fixture.destroy();
  });

  it('should create the component and initialize mock appointments', () => {
    expect(component).toBeTruthy();
    expect(component.appointments().length).toBeGreaterThan(0);
    expect(component.activeTab()).toBe('upcoming');
  });

  it('should filter items correctly for each tab', () => {
    component.activeTab.set('upcoming');
    const upcoming = component.itemsForTab();
    expect(upcoming.every((a) => ['CONFIRMED', 'CHECKED_IN'].includes(a.status))).toBeTrue();

    component.activeTab.set('completed');
    const completed = component.itemsForTab();
    expect(completed.every((a) => a.status === 'COMPLETED')).toBeTrue();

    component.activeTab.set('cancelled');
    const cancelled = component.itemsForTab();
    expect(cancelled.every((a) => a.status.includes('CANCELLED'))).toBeTrue();
  });

  describe('canCancel', () => {
    it('should allow cancellation only for CONFIRMED status', () => {
      expect(component.canCancel({ id: '1', status: 'CONFIRMED' })).toBeTrue();
      expect(component.canCancel({ id: '2', status: 'CHECKED_IN' })).toBeFalse();
      expect(component.canCancel({ id: '3', status: 'COMPLETED' })).toBeFalse();
      expect(component.canCancel({ id: '4', status: 'CANCELLED_BY_PATIENT' })).toBeFalse();
      expect(component.canCancel({ id: '5', status: 'CANCELLED_BY_CLINIC' })).toBeFalse();
    });
  });

  describe('Refund Policy calculation (Section 5.3 & Card 3.11)', () => {
    const createMockTarget = (hoursAhead: number) => {
      const targetTime = Date.now() + hoursAhead * 3600000;
      const targetDate = new Date(targetTime);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      const hh = String(targetDate.getHours()).padStart(2, '0');
      const min = String(targetDate.getMinutes()).padStart(2, '0');
      const ss = String(targetDate.getSeconds()).padStart(2, '0');

      return {
        id: 'target-1',
        status: 'CONFIRMED',
        totalAmount: 200000,
        schedule: {
          date: `${yyyy}-${mm}-${dd}`,
          startTime: `${hh}:${min}:${ss}`,
          endTime: '23:59:59',
        },
      };
    };

    it('should classify >= 24 hours as green (100% refund)', () => {
      // 25 hours ahead
      spyOn(component, 'remainingMs').and.returnValue(25 * 3600000);
      expect(component.refundBand()).toBe('green');
      expect(component.refundMessage()).toBe('Được hoàn 100% chi phí khám');

      // Exactly 24 hours ahead
      (component.remainingMs as jasmine.Spy).and.returnValue(24 * 3600000);
      expect(component.refundBand()).toBe('green');
      expect(component.refundMessage()).toBe('Được hoàn 100% chi phí khám');
    });

    it('should classify between 2 hours and < 24 hours as yellow (70% refund)', () => {
      // 23.9 hours ahead
      spyOn(component, 'remainingMs').and.returnValue(23.9 * 3600000);
      expect(component.refundBand()).toBe('yellow');
      expect(component.refundMessage()).toBe(
        'Được hoàn 70% chi phí khám (khấu trừ 30% phí điều phối ca trực)'
      );

      // Exactly 2 hours ahead
      (component.remainingMs as jasmine.Spy).and.returnValue(2 * 3600000);
      expect(component.refundBand()).toBe('yellow');
      expect(component.refundMessage()).toBe(
        'Được hoàn 70% chi phí khám (khấu trừ 30% phí điều phối ca trực)'
      );
    });

    it('should classify < 2 hours as red (0% refund)', () => {
      // 1.9 hours ahead
      spyOn(component, 'remainingMs').and.returnValue(1.9 * 3600000);
      expect(component.refundBand()).toBe('red');
      expect(component.refundMessage()).toBe(
        'Hủy trong vòng dưới 2 giờ trước khám không được hoàn phí'
      );

      // 30 minutes ahead
      (component.remainingMs as jasmine.Spy).and.returnValue(0.5 * 3600000);
      expect(component.refundBand()).toBe('red');
      expect(component.refundMessage()).toBe(
        'Hủy trong vòng dưới 2 giờ trước khám không được hoàn phí'
      );

      // 0 or past appointment
      (component.remainingMs as jasmine.Spy).and.returnValue(0);
      expect(component.refundBand()).toBe('red');
      expect(component.refundMessage()).toBe(
        'Hủy trong vòng dưới 2 giờ trước khám không được hoàn phí'
      );
    });
  });

  describe('Cancellation Modal & Submission Flow', () => {
    it('should open cancellation modal and reset fields', () => {
      const appt = { id: 'apt-01', status: 'CONFIRMED' };
      component.cancelReason = 'old reason';
      component.consentAccepted = true;

      component.openCancel(appt);

      expect(component.cancelTarget()).toEqual(appt);
      expect(component.cancelReason).toBe('');
      expect(component.consentAccepted).toBeFalse();
      expect(component.reasonError()).toBe('');
      expect(component.consentError).toBeFalse();
    });

    it('should not open modal if appointment cannot be cancelled', () => {
      const appt = { id: 'apt-02', status: 'COMPLETED' };
      component.openCancel(appt);
      expect(component.cancelTarget()).toBeNull();
    });

    it('should close modal when not submitting', () => {
      component.cancelTarget.set({ id: 'apt-01', status: 'CONFIRMED' });
      component.closeCancel();
      expect(component.cancelTarget()).toBeNull();
    });

    it('should reject submission if reason is empty', () => {
      component.cancelTarget.set({ id: 'apt-01', status: 'CONFIRMED' });
      component.cancelReason = '   ';
      component.consentAccepted = true;

      component.submitCancel();

      expect(component.reasonError()).toBe('Vui lòng nhập lý do hủy.');
      expect(component.submitting()).toBeFalse();
    });

    it('should reject submission if consent checkbox is not accepted', () => {
      component.cancelTarget.set({ id: 'apt-01', status: 'CONFIRMED' });
      component.cancelReason = 'Có lịch công tác';
      component.consentAccepted = false;

      component.submitCancel();

      expect(component.consentError).toBeTrue();
      expect(component.submitting()).toBeFalse();
    });

    it('should successfully cancel in mock mode and update local status', fakeAsync(() => {
      const appt = component.appointments()[0];
      component.openCancel(appt);
      component.cancelReason = 'Có việc bận đột xuất';
      component.consentAccepted = true;

      component.submitCancel();
      expect(component.submitting()).toBeTrue();

      tick(500);

      expect(component.submitting()).toBeFalse();
      expect(component.cancelTarget()).toBeNull();
      expect(component.toast()).toContain('thành công');

      const updated = component.appointments().find((a) => a.id === appt.id);
      expect(updated?.status).toBe('CANCELLED_BY_PATIENT');
      expect(updated?.cancellationReason).toBe('Có việc bận đột xuất');

      tick(5000);
    }));

    it('should send POST request to API when isMock is false', () => {
      component.isMock.set(false);
      const appt = { id: 'apt-real-01', status: 'CONFIRMED' };
      component.appointments.set([appt]);
      component.openCancel(appt);
      component.cancelReason = 'Thay đổi kế hoạch';
      component.consentAccepted = true;

      component.submitCancel();
      expect(component.submitting()).toBeTrue();

      const req = httpMock.expectOne('/api/v1/appointments/apt-real-01/cancel');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        reason: 'Thay đổi kế hoạch',
        consentAccepted: true,
      });

      req.flush({ id: 'apt-real-01', status: 'CANCELLED_BY_PATIENT' });

      // In real mode, it triggers this.load()
      const reloadReq = httpMock.expectOne('/api/v1/appointments/me');
      expect(reloadReq.request.method).toBe('GET');
      reloadReq.flush([]);

      expect(component.submitting()).toBeFalse();
      expect(component.cancelTarget()).toBeNull();
      expect(component.toast()).toContain('thành công');
    });

    it('should handle API failure gracefully with error toast', () => {
      component.isMock.set(false);
      const appt = { id: 'apt-real-02', status: 'CONFIRMED' };
      component.appointments.set([appt]);
      component.openCancel(appt);
      component.cancelReason = 'Thay đổi kế hoạch';
      component.consentAccepted = true;

      component.submitCancel();

      const req = httpMock.expectOne('/api/v1/appointments/apt-real-02/cancel');
      req.flush({ message: 'Lịch hẹn không thể hủy' }, { status: 400, statusText: 'Bad Request' });

      expect(component.submitting()).toBeFalse();
      expect(component.toast()).toBe('Lịch hẹn không thể hủy');
      expect(component.toastType()).toBe('error');
    });
  });
});
