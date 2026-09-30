import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { PaymentCallbackPage } from './payment-callback.page';

describe('PaymentCallbackPage', () => {
  let fixture!: ComponentFixture<PaymentCallbackPage>;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  async function createPage(params: Record<string, string>): Promise<void> {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    await TestBed.configureTestingModule({
      imports: [PaymentCallbackPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(params)) } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PaymentCallbackPage);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
    fixture?.destroy();
  });

  it('does not accept a VNPAY success code when Backend still reports unpaid', async () => {
    await createPage({ vnp_ResponseCode: '00', vnp_TxnRef: 'txn-1', vnp_SecureHash: 'signature' });
    httpMock.expectOne('/api/v1/appointments/me').flush([appointment('apt-1', 'txn-1')]);
    fixture.detectChanges();

    expect(fixture.componentInstance.provider()).toBe('VNPAY');
    expect(fixture.componentInstance.state()).toBe('pending');
    expect(fixture.nativeElement.textContent).toContain('Backend chưa ghi nhận thanh toán thành công');
    expect(fixture.nativeElement.textContent).not.toContain('Thanh toán & Đặt khám thành công!');
  });

  it('loads the real appointment QR only after Backend reports paid and confirmed', async () => {
    await createPage({ resultCode: '0', orderId: 'order-1', transId: 'unverified-bank-txn' });
    httpMock.expectOne('/api/v1/appointments/me').flush([
      appointment('appointment-1', 'order-1', 'CONFIRMED', 'PAID'),
    ]);

    const qrRequest = httpMock.expectOne('/api/v1/appointments/appointment-1/check-in-qr');
    expect(qrRequest.request.method).toBe('GET');
    qrRequest.flush({ qrToken: 'backend-check-in-token', expiresAt: '2026-10-01T10:00:00Z' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.provider()).toBe('MOMO');
    expect(fixture.componentInstance.state()).toBe('success');
    expect(fixture.nativeElement.textContent).toContain('Thanh toán & Đặt khám thành công!');
    expect(fixture.nativeElement.textContent).toContain('Backend chưa cung cấp');
    expect(fixture.nativeElement.textContent).not.toContain('unverified-bank-txn');
    expect(fixture.nativeElement.textContent).not.toContain('Mô phỏng kết quả Backend');
    expect(fixture.nativeElement.querySelector('img[alt="Mã QR check-in lịch hẹn"]')).toBeTruthy();
  });

  it('shows a Backend payment failure reason and offers a retry route', async () => {
    await createPage({ resultCode: '0', orderId: 'order-failed' });
    httpMock.expectOne('/api/v1/appointments/me').flush([{
      ...appointment('appointment-failed', 'order-failed', 'PENDING_PAYMENT', 'FAILED'),
      paymentFailureReason: 'Ngân hàng từ chối giao dịch.',
    }]);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('failed');
    expect(fixture.nativeElement.textContent).toContain('Ngân hàng từ chối giao dịch.');
    expect(fixture.nativeElement.textContent).toContain('Chọn lại phương thức thanh toán');
    fixture.componentInstance.choosePaymentAgain();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/booking']);
  });

  it('shows cancellation reason only when Backend reports a cancelled appointment', async () => {
    await createPage({ vnp_ResponseCode: '00', vnp_TxnRef: 'order-cancelled', vnp_SecureHash: 'signature' });
    httpMock.expectOne('/api/v1/appointments/me').flush([{
      ...appointment('appointment-cancelled', 'order-cancelled', 'CANCELLED_BY_PATIENT'),
      cancellationReason: 'Bệnh nhân đã hủy lịch.',
    }]);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('cancelled');
    expect(fixture.nativeElement.textContent).toContain('Bệnh nhân đã hủy lịch.');
  });

  it('shows an error when the callback reference has no matching patient appointment', async () => {
    await createPage({ resultCode: '0', orderId: 'unknown-order' });
    httpMock.expectOne('/api/v1/appointments/me').flush([appointment('appointment-1', 'other-order')]);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('Backend không tìm thấy lịch hẹn');
  });

  it('shows an error when the Backend appointment request fails', async () => {
    await createPage({ resultCode: '0', orderId: 'order-1' });
    httpMock.expectOne('/api/v1/appointments/me').error(new ProgressEvent('network error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('Không thể kiểm tra trạng thái thanh toán với Backend');
  });

  it('renders a clearly labeled success receipt from the development Backend simulation', async () => {
    await createPage({ resultCode: '0', orderId: 'order-1' });
    httpMock.expectOne('/api/v1/appointments/me').flush([appointment('apt-1', 'order-1')]);
    fixture.detectChanges();

    await fixture.componentInstance.simulateBackendSuccess();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(fixture.componentInstance.state()).toBe('success');
    expect(text).toContain('Thanh toán & Đặt khám thành công!');
    expect(text).toContain('Mô phỏng kết quả Backend - không phải giao dịch thật');
    expect(text).toContain('BS. Nguyễn Minh Anh');
    expect(text).toContain('350.000');
    expect(text).toContain('DEMO-BANK-TXN-000001');
    expect(fixture.nativeElement.querySelector('img[alt="Mã QR check-in lịch hẹn"]')).toBeTruthy();
    expect(text).toContain('Lưu mã QR vào máy');
    expect(text).toContain('Xem trong lịch sử khám');
  });

  it('shows an invalid callback state when required provider parameters are missing', async () => {
    await createPage({ vnp_ResponseCode: '00', vnp_TxnRef: 'txn-1' });

    expect(fixture.componentInstance.state()).toBe('invalid');
    expect(fixture.nativeElement.textContent).toContain('Callback thiếu tham số bắt buộc');
  });

  it('provides patient history and home navigation', async () => {
    await createPage({});

    fixture.componentInstance.goToHistory();
    fixture.componentInstance.goHome();

    expect(router.navigate).toHaveBeenCalledWith(['/patient/history']);
    expect(router.navigate).toHaveBeenCalledWith(['/patient/doctor-search']);
  });

  function appointment(
    id: string,
    appointmentCode: string,
    status = 'PENDING_PAYMENT',
    paymentStatus = 'UNPAID',
  ) {
    return {
      id,
      appointmentCode,
      status,
      paymentStatus,
      totalAmount: 350000,
      doctor: { academicTitle: 'BS.', user: { fullName: 'Nguyễn Minh Anh' } },
      schedule: { date: '2026-10-02', startTime: '09:30', endTime: '10:00' },
    };
  }
});