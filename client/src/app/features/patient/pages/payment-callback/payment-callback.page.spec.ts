import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentTransactionStatus } from '@shared/enums';
import { PaymentStatusResponse } from '@shared/interfaces';
import { of, throwError } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';
import { PaymentCallbackPage } from './payment-callback.page';

describe('PaymentCallbackPage', () => {
  let fixture!: ComponentFixture<PaymentCallbackPage>;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let paymentApi: jasmine.SpyObj<PatientBookingApiService>;

  async function createPage(
    params: Record<string, string>,
    status: PaymentStatusResponse = pendingStatus(),
    requestError = false,
  ): Promise<void> {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    paymentApi = jasmine.createSpyObj<PatientBookingApiService>(
      'PatientBookingApiService',
      ['getPaymentStatus'],
    );
    paymentApi.getPaymentStatus.and.returnValue(
      requestError ? throwError(() => new Error('network error')) : of(status),
    );
    sessionStorage.setItem('pendingPaymentAppointmentId', 'appointment-id');
    await TestBed.configureTestingModule({
      imports: [PaymentCallbackPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(params)) } },
        { provide: Router, useValue: router },
        { provide: PatientBookingApiService, useValue: paymentApi },
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

  it('does not accept a VNPAY success code when Backend still reports pending', async () => {
    await createPage(
      { vnp_ResponseCode: '00', vnp_TxnRef: 'txn-1', vnp_SecureHash: 'signature' },
      pendingStatus(),
    );

    expect(fixture.componentInstance.provider()).toBe('VNPAY');
    expect(fixture.componentInstance.state()).toBe('pending');
    expect(paymentApi.getPaymentStatus).toHaveBeenCalledWith('appointment-id');
    expect(fixture.nativeElement.textContent).toContain('Backend chưa xác nhận giao dịch');
    expect(fixture.nativeElement.textContent).not.toContain('Thanh toán & Đặt khám thành công!');
  });

  it('loads the real appointment QR only after Backend reports paid and confirmed', async () => {
    await createPage(
      { resultCode: '0', orderId: 'order-1', transId: 'unverified-bank-txn' },
      successfulStatus(),
    );
    expect(paymentApi.getPaymentStatus).toHaveBeenCalledWith('appointment-id');
    httpMock.expectOne('/api/v1/appointments/me').flush([
      appointment('appointment-id', 'APT-1', 'CONFIRMED', 'PAID'),
    ]);

    const qrRequest = httpMock.expectOne('/api/v1/appointments/appointment-id/check-in-qr');
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
    await createPage({ resultCode: '0', orderId: 'order-failed' }, failedStatus());

    expect(fixture.componentInstance.state()).toBe('failed');
    expect(fixture.nativeElement.textContent).toContain('Backend xác nhận giao dịch thất bại');
    expect(fixture.nativeElement.textContent).toContain('Chọn lại phương thức thanh toán');
    fixture.componentInstance.choosePaymentAgain();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/booking']);
  });

  it('shows cancellation reason only when Backend reports a cancelled appointment', async () => {
    await createPage(
      { vnp_ResponseCode: '00', vnp_TxnRef: 'order-cancelled', vnp_SecureHash: 'signature' },
      cancelledStatus(),
    );

    expect(fixture.componentInstance.state()).toBe('cancelled');
    expect(fixture.nativeElement.textContent).toContain('bị hủy theo trạng thái Backend');
  });

  it('shows an error when the Backend payment status request fails', async () => {
    await createPage({ resultCode: '0', orderId: 'order-1' }, pendingStatus(), true);

    expect(fixture.componentInstance.state()).toBe('error');
    expect(paymentApi.getPaymentStatus).toHaveBeenCalledWith('appointment-id');
    expect(fixture.nativeElement.textContent).toContain('Không thể kiểm tra trạng thái thanh toán với Backend');
  });

  it('renders a clearly labeled success receipt from the development Backend simulation', async () => {
    await createPage({ resultCode: '0', orderId: 'order-1' });

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
    expect(fixture.nativeElement.textContent).toContain('Callback VNPAY thiếu tham số bắt buộc');
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

  function pendingStatus(): PaymentStatusResponse {
    return {
      appointmentId: 'appointment-id',
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.PENDING,
      expiresAt: null,
      paidAt: null,
    };
  }

  function successfulStatus(): PaymentStatusResponse {
    return {
      ...pendingStatus(),
      appointmentStatus: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      transactionStatus: PaymentTransactionStatus.SUCCESS,
    };
  }

  function failedStatus(): PaymentStatusResponse {
    return {
      ...pendingStatus(),
      paymentStatus: PaymentStatus.FAILED,
      transactionStatus: PaymentTransactionStatus.FAILED,
    };
  }

  function cancelledStatus(): PaymentStatusResponse {
    return {
      ...pendingStatus(),
      appointmentStatus: AppointmentStatus.CANCELLED,
      transactionStatus: PaymentTransactionStatus.TIMEOUT,
    };
  }
});