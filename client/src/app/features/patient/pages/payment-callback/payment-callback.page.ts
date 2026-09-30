import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppointmentStatus, PaymentStatus, PaymentTransactionStatus } from '@shared/enums';
import { PaymentStatusResponse } from '@shared/interfaces';
import { toDataURL } from 'qrcode';
import { EMPTY, Subscription, catchError, expand, switchMap, timer } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';
import { CurrencyVndPipe } from '../../../../shared/pipes/currency-vnd.pipe';

type PaymentProvider = 'VNPAY' | 'MOMO';
type CallbackState = 'loading' | 'invalid' | 'pending' | 'warning' | 'failed' | 'cancelled' | 'error' | 'success';

interface PatientAppointment {
  id: string;
  appointmentCode: string;
  status: string;
  paymentStatus: string;
  totalAmount: number | string;
  paidAt?: string | null;
  cancellationReason?: string | null;
  paymentFailureReason?: string | null;
  doctor?: {
    academicTitle?: string | null;
    user?: { fullName?: string | null };
  };
  schedule?: {
    date?: string;
    startTime?: string;
    endTime?: string;
  };
}

interface PaymentReceipt {
  appointment: {
    appointmentCode: string;
    doctorName: string;
    scheduleLabel: string;
  };
  payment: {
    paidAmount: number;
    bankTransactionId: string | null;
    isDemo?: boolean;
  };
}

interface CheckInQrResponse {
  qrToken: string;
  expiresAt: string;
}

@Component({
  selector: 'app-payment-callback-page',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyVndPipe],
  templateUrl: './payment-callback.page.html',
})
export class PaymentCallbackPage {
  private readonly http = inject(HttpClient);
  private readonly paymentApi = inject(PatientBookingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private verificationSequence = 0;

  readonly state = signal<CallbackState>('loading');
  readonly provider = signal<PaymentProvider | null>(null);
  readonly message = signal('Callback thiếu hoặc không có tham số thanh toán hợp lệ.');
  readonly showDemoControls = !environment.production;
  readonly verifiedPayment = signal<PaymentReceipt | null>(null);
  readonly qrDataUrl = signal('');
  private latestParams: ParamMap | null = null;
  private verificationSubscription?: Subscription;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.readCallback(params));
  }

  async simulateBackendSuccess(): Promise<void> {
    if (!this.showDemoControls) return;

    const response: PaymentReceipt = {
      appointment: {
        appointmentCode: 'DEMO-APT-20261002-001',
        doctorName: 'BS. Nguyễn Minh Anh',
        scheduleLabel: '09:30 - 10:00, 02/10/2026',
      },
      payment: {
        paidAmount: 350000,
        bankTransactionId: 'DEMO-BANK-TXN-000001',
        isDemo: true,
      },
    };

    this.state.set('loading');
    try {
      const qrDataUrl = await toDataURL('DEMO-CHECK-IN:DEMO-APT-20261002-001', {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      this.verifiedPayment.set(response);
      this.qrDataUrl.set(qrDataUrl);
      this.state.set('success');
    } catch {
      this.message.set('Không thể tạo ảnh QR mô phỏng. Vui lòng thử lại.');
      this.state.set('error');
    }
  }

  saveQr(): void {
    const result = this.verifiedPayment();
    const qrDataUrl = this.qrDataUrl();
    if (!result || !qrDataUrl) return;

    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${result.appointment.appointmentCode}-qr.png`;
    link.click();
  }

  goToHistory(): void {
    void this.router.navigate(['/patient/history']);
  }

  goHome(): void {
    void this.router.navigate(['/patient/doctor-search']);
  }

  choosePaymentAgain(): void {
    void this.router.navigate(['/patient/booking']);
  }

  retryStatusCheck(): void {
    if (this.latestParams) this.readCallback(this.latestParams);
  }

  private readCallback(params: ParamMap): void {
    this.verificationSubscription?.unsubscribe();
    this.latestParams = params;
    const requestId = ++this.verificationSequence;
    this.verifiedPayment.set(null);
    this.qrDataUrl.set('');
    const hasVnpayFields = ['vnp_ResponseCode', 'vnp_TxnRef', 'vnp_SecureHash']
      .some((key) => params.has(key));
    const hasMomoFields = ['resultCode', 'orderId'].some((key) => params.has(key));
    const isVnpayComplete = ['vnp_ResponseCode', 'vnp_TxnRef', 'vnp_SecureHash']
      .every((key) => !!params.get(key)?.trim());
    const isMomoComplete = !!params.get('resultCode')?.trim() && !!params.get('orderId')?.trim();

    if (hasVnpayFields && hasMomoFields) {
      this.provider.set(null);
      this.message.set('Callback chứa tham số của nhiều nhà cung cấp hoặc không xác định được nguồn thanh toán.');
      this.state.set('invalid');
      return;
    }

    if (hasVnpayFields) {
      if (!isVnpayComplete) {
        this.provider.set(null);
        this.message.set('Callback VNPAY thiếu tham số bắt buộc.');
        this.state.set('invalid');
        return;
      }
      this.provider.set('VNPAY');
    } else if (hasMomoFields) {
      if (!isMomoComplete) {
        this.provider.set(null);
        this.message.set('Callback MoMo thiếu tham số bắt buộc.');
        this.state.set('invalid');
        return;
      }
      this.provider.set('MOMO');
    } else {
      this.provider.set(null);
    }

    const appointmentId = params.get('appointmentId')?.trim()
      || sessionStorage.getItem('pendingPaymentAppointmentId');
    if (!appointmentId) {
      this.message.set('Không tìm thấy lịch hẹn cần kiểm tra. Phiên thanh toán có thể đã hết hạn.');
      this.state.set('error');
      return;
    }

    this.state.set('loading');
    this.verificationSubscription = this.paymentApi.getPaymentStatus(appointmentId).pipe(
      expand((status) => this.stateFor(status) === 'pending'
        ? timer(2_000).pipe(switchMap(() => this.paymentApi.getPaymentStatus(appointmentId)))
        : EMPTY),
      catchError((error: unknown) => {
        if (requestId === this.verificationSequence) {
          this.message.set(this.apiError(error, 'Không thể kiểm tra trạng thái thanh toán với Backend.'));
          this.state.set('error');
        }
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
        next: (status) => {
          if (requestId !== this.verificationSequence) return;
          const state = this.stateFor(status);
          if (state !== 'success') {
            this.state.set(state);
            this.message.set(this.statusMessage(status, state));
            if (['failed', 'cancelled'].includes(state)) {
              sessionStorage.removeItem('pendingPaymentAppointmentId');
              sessionStorage.removeItem('pendingPaymentContext');
            }
            return;
          }
          this.loadVerifiedAppointment(status, requestId);
        },
        error: (error: unknown) => {
          if (requestId !== this.verificationSequence) return;
          this.message.set(this.apiError(error, 'Không thể kiểm tra trạng thái thanh toán với Backend.'));
          this.state.set('error');
        },
      });
  }

  private loadVerifiedAppointment(status: PaymentStatusResponse, requestId: number): void {
    this.http.get<PatientAppointment[]>(`${environment.apiBaseUrl}/appointments/me`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointments) => {
          if (requestId !== this.verificationSequence) return;
          const appointment = (appointments ?? []).find((item) => item.id === status.appointmentId);
          if (!appointment) {
            this.message.set('Không tìm thấy thông tin lịch hẹn đã thanh toán trong hồ sơ của bạn.');
            this.state.set('error');
            return;
          }
          this.loadCheckInQr(appointment, requestId);
        },
        error: (error: unknown) => {
          if (requestId !== this.verificationSequence) return;
          this.message.set(this.apiError(error, 'Không thể tải thông tin lịch hẹn đã thanh toán.'));
          this.state.set('error');
        },
      });
  }

  private loadCheckInQr(appointment: PatientAppointment, requestId: number): void {
    this.http.get<CheckInQrResponse>(
      `${environment.apiBaseUrl}/appointments/${encodeURIComponent(appointment.id)}/check-in-qr`,
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ qrToken }) => {
        if (requestId !== this.verificationSequence) return;
        void this.createVerifiedReceipt(appointment, qrToken, requestId);
      },
      error: (error: unknown) => {
        if (requestId !== this.verificationSequence) return;
        this.message.set(this.apiError(error, 'Thanh toán đã xác nhận nhưng chưa thể tải mã QR lịch hẹn.'));
        this.state.set('error');
      },
    });
  }

  private stateFor(status: PaymentStatusResponse): CallbackState {
    if (
      status.transactionStatus === PaymentTransactionStatus.SUCCESS &&
      status.paymentStatus === PaymentStatus.PAID &&
      status.appointmentStatus === AppointmentStatus.CONFIRMED
    ) return 'success';
    if (
      status.transactionStatus === PaymentTransactionStatus.RECONCILIATION_REQUIRED ||
      status.transactionStatus === PaymentTransactionStatus.LATE_SUCCESS ||
      status.paymentStatus === PaymentStatus.REFUND_PENDING
    ) return 'warning';
    if ([AppointmentStatus.CANCELLED, AppointmentStatus.CANCELLED_BY_PATIENT,
      AppointmentStatus.CANCELLED_BY_CLINIC, AppointmentStatus.EXPIRED].includes(status.appointmentStatus)) {
      return 'cancelled';
    }
    if (
      [PaymentTransactionStatus.FAILED, PaymentTransactionStatus.TIMEOUT].includes(
        status.transactionStatus as PaymentTransactionStatus,
      ) || status.paymentStatus === PaymentStatus.FAILED
    ) return 'failed';
    if (
      status.appointmentStatus === AppointmentStatus.PENDING_PAYMENT &&
      (status.transactionStatus === PaymentTransactionStatus.PENDING || status.transactionStatus === null)
    ) return 'pending';
    return 'error';
  }

  private statusMessage(status: PaymentStatusResponse, state: CallbackState): string {
    if (state === 'pending') {
      return 'Backend chưa xác nhận giao dịch. Kiểm tra lại sau ít phút; không dựa vào mã thành công trên URL.';
    }
    if (state === 'warning') {
      return 'Giao dịch đang được Backend đối soát. Vui lòng không thanh toán lại.';
    }
    if (state === 'failed') {
      return 'Backend xác nhận giao dịch thất bại hoặc đã hết thời gian thanh toán.';
    }
    if (state === 'cancelled') {
      return `Lịch hẹn đã ${status.appointmentStatus === AppointmentStatus.EXPIRED ? 'hết hạn' : 'bị hủy'} theo trạng thái Backend.`;
    }
    return 'Không thể xác định trạng thái thanh toán.';
  }

  private async createVerifiedReceipt(
    appointment: PatientAppointment,
    qrToken: string,
    requestId: number,
  ): Promise<void> {
    try {
      const qrDataUrl = await toDataURL(qrToken, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      if (requestId !== this.verificationSequence) return;
      const title = appointment.doctor?.academicTitle?.trim();
      const name = appointment.doctor?.user?.fullName?.trim() || 'Bác sĩ';
      const date = appointment.schedule?.date ?? '';
      const time = [appointment.schedule?.startTime, appointment.schedule?.endTime]
        .filter(Boolean)
        .join(' - ');
      this.verifiedPayment.set({
        appointment: {
          appointmentCode: appointment.appointmentCode,
          doctorName: [title, name].filter(Boolean).join(' '),
          scheduleLabel: [time, date].filter(Boolean).join(', ') || 'Chưa có thông tin khung giờ',
        },
        payment: {
          paidAmount: Number(appointment.totalAmount),
          bankTransactionId: null,
        },
      });
      this.qrDataUrl.set(qrDataUrl);
      this.state.set('success');
    } catch {
      if (requestId !== this.verificationSequence) return;
      this.message.set('Thanh toán đã xác nhận nhưng không thể tạo ảnh QR. Vui lòng thử lại.');
      this.state.set('error');
    }
  }

  private apiError(error: unknown, fallback: string): string {
    const response = error as { error?: { message?: string | string[] } };
    const message = response?.error?.message;
    return Array.isArray(message) ? message.join(' ') : message || fallback;
  }
}