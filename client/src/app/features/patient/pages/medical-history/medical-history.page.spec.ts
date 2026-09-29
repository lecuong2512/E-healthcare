import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NzMessageService } from 'ng-zorro-antd/message';

import { MedicalHistoryPage } from './medical-history.page';

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
        provideNoopAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MedicalHistoryPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/appointments/me').flush([]);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    fixture.destroy();
  });

  it('should create the component and load real appointments by default', () => {
    expect(component).toBeTruthy();
    expect(component.appointments()).toEqual([]);
    expect(component.activeTab()).toBe('upcoming');
  });

  it('should filter items correctly for each tab', () => {
    component.appointments.set([
      { id: '1', status: 'CONFIRMED' },
      { id: '2', status: 'CHECKED_IN' },
      { id: '3', status: 'COMPLETED' },
      { id: '4', status: 'CANCELLED_BY_PATIENT' },
      { id: '5', status: 'CANCELLED_BY_CLINIC' },
    ]);
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

  it('shows an empty state when the patient has no appointments', () => {
    expect(fixture.nativeElement.textContent).toContain('Bạn chưa có lịch khám sắp tới');
  });

  it('shows loading while refreshing appointments', () => {
    component.load();
    expect(component.loading()).toBeTrue();
    httpMock.expectOne('/api/v1/appointments/me').flush([]);
    expect(component.loading()).toBeFalse();
  });

  it('shows an error state and retry action when the API fails', () => {
    component.load();
    httpMock.expectOne('/api/v1/appointments/me').flush(
      { message: 'Lỗi tải dữ liệu' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();
    expect(component.error()).toBe('Lỗi tải dữ liệu');
    expect(fixture.nativeElement.textContent).toContain('Thử lại');
  });

  it('requests and renders the check-in QR returned by the API', async () => {
    component.load();
    httpMock.expectOne('/api/v1/appointments/me').flush([
      { id: 'appointment-1', status: 'CONFIRMED', appointmentCode: 'APT-1' },
    ]);
    const qrRequest = httpMock.expectOne('/api/v1/appointments/appointment-1/check-in-qr');
    expect(qrRequest.request.method).toBe('GET');
    qrRequest.flush({ qrToken: 'check-in-token', expiresAt: '2026-09-29T10:00:00Z' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img[alt="Mã QR check-in lịch hẹn"]')).toBeTruthy();
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

    it('sends POST to the API and refreshes appointment history', () => {
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

      const reloadReq = httpMock.expectOne('/api/v1/appointments/me');
      expect(reloadReq.request.method).toBe('GET');
      reloadReq.flush([]);

      expect(component.submitting()).toBeFalse();
      expect(component.cancelTarget()).toBeNull();
      expect(component.toast()).toContain('thành công');
    });

    it('handles API failure gracefully with an error toast', () => {
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

  describe('Doctor review flow', () => {
    const completed = {
      id: 'appointment-review-01',
      status: 'COMPLETED',
      doctor: { id: 'doctor-review-01', user: { fullName: 'Bác sĩ An' } },
      review: null,
    };

    it('only allows completed appointments without an existing review', () => {
      expect(component.canReview(completed)).toBeTrue();
      expect(component.canReview({ ...completed, status: 'CONFIRMED' })).toBeFalse();
      expect(
        component.canReview({
          ...completed,
          review: { id: 'review-1', rating: 5, comment: null, createdAt: '2026-09-28' },
        })
      ).toBeFalse();
    });

    it('renders the review action only for an unreviewed completed appointment', () => {
      component.appointments.set([completed]);
      component.activeTab.set('completed');
      fixture.detectChanges();

      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>
      );
      expect(buttons.some((button) => button.textContent?.includes('Đánh giá bác sĩ'))).toBeTrue();

      component.appointments.set([
        {
          ...completed,
          review: { id: 'review-1', rating: 5, comment: null, createdAt: '2026-09-28' },
        },
      ]);
      fixture.detectChanges();
      const updatedButtons = Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>
      );
      expect(
        updatedButtons.some((button) => button.textContent?.includes('Đánh giá bác sĩ'))
      ).toBeFalse();
      expect(fixture.nativeElement.textContent).toContain('Đã đánh giá');
      expect(fixture.nativeElement.querySelector('nz-rate')).not.toBeNull();
    });

    it('does not render a review action for upcoming statuses', () => {
      component.appointments.set([
        { ...completed, id: 'confirmed-1', status: 'CONFIRMED' },
        { ...completed, id: 'checked-in-1', status: 'CHECKED_IN' },
      ]);
      component.activeTab.set('upcoming');
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Đánh giá bác sĩ');
    });

    it('opens the modal with a reset form', () => {
      component.reviewRating.set(5);
      component.reviewComment = 'old';

      component.openReview(completed);

      expect(component.reviewTarget()).toEqual(completed);
      expect(component.reviewModalVisible()).toBeTrue();
      expect(component.reviewRating()).toBe(0);
      expect(component.reviewComment).toBe('');
    });

    it('renders rating validation and the 500-character comment limit', fakeAsync(() => {
      component.openReview(completed);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const okButton = document.querySelector(
        '.ant-modal-footer .ant-btn-primary'
      ) as HTMLButtonElement;
      const textarea = document.querySelector(
        '#doctor-review-comment'
      ) as HTMLTextAreaElement;
      expect(okButton.disabled).toBeTrue();
      expect(textarea.maxLength).toBe(500);
      expect(document.body.textContent).toContain('0 / 500');

      component.reviewRating.set(5);
      component.reviewComment = 'a'.repeat(500);
      fixture.detectChanges();
      expect(okButton.disabled).toBeFalse();
      expect(document.body.textContent).toContain('500 / 500');
      component.closeReview();
      fixture.detectChanges();
    }));

    it('posts the review and marks the appointment as reviewed', () => {
      const messages = TestBed.inject(NzMessageService);
      spyOn(messages, 'success');
      component.appointments.set([completed]);
      component.openReview(completed);
      component.reviewRating.set(4);
      component.reviewComment = '  Tư vấn rõ ràng  ';

      component.submitReview();

      const request = httpMock.expectOne('/api/v1/doctors/doctor-review-01/reviews');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        appointmentId: 'appointment-review-01',
        rating: 4,
        comment: 'Tư vấn rõ ràng',
      });
      request.flush({
        id: 'review-01',
        appointmentId: 'appointment-review-01',
        doctorId: 'doctor-review-01',
        rating: 4,
        comment: 'Tư vấn rõ ràng',
        createdAt: '2026-09-28T06:00:00.000Z',
        ratingAverage: 4.5,
      });

      expect(component.appointments()[0].review?.rating).toBe(4);
      expect(component.appointments()[0].doctor?.ratingAverage).toBe(4.5);
      expect(component.reviewModalVisible()).toBeFalse();
      expect(messages.success).toHaveBeenCalled();
    });

    it('blocks duplicate submission while the first request is pending', () => {
      component.openReview(completed);
      component.reviewRating.set(5);

      component.submitReview();
      component.submitReview();

      const requests = httpMock.match('/api/v1/doctors/doctor-review-01/reviews');
      expect(requests.length).toBe(1);
      expect(component.reviewSubmitting()).toBeTrue();
      requests[0].flush({
        id: 'review-02',
        appointmentId: 'appointment-review-01',
        doctorId: 'doctor-review-01',
        rating: 5,
        comment: null,
        createdAt: '2026-09-28T06:00:00.000Z',
        ratingAverage: 5,
      });
      expect(component.reviewSubmitting()).toBeFalse();
    });

    it('keeps the modal open and reports an API error', () => {
      const messages = TestBed.inject(NzMessageService);
      spyOn(messages, 'error');
      component.openReview(completed);
      component.reviewRating.set(5);

      component.submitReview();
      const request = httpMock.expectOne('/api/v1/doctors/doctor-review-01/reviews');
      request.flush(
        { message: 'Ca khám này đã được đánh giá.' },
        { status: 409, statusText: 'Conflict' }
      );

      expect(component.reviewSubmitting()).toBeFalse();
      expect(component.reviewModalVisible()).toBeTrue();
      expect(messages.error).toHaveBeenCalledWith('Ca khám này đã được đánh giá.');
    });
  });
});
