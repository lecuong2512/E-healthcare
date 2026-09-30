import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toDataURL } from 'qrcode';
import { environment } from '../../../../../environments/environment';
import { CurrencyVndPipe } from '../../../../shared/pipes/currency-vnd.pipe';

type PaymentProvider = 'VNPAY' | 'MOMO';
type CallbackState = 'loading' | 'invalid' | 'pending' | 'failed' | 'cancelled' | 'error' | 'success';

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

  private readCallback(params: ParamMap): void {
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

    let reference: string | null = null;
    if (hasVnpayFields && isVnpayComplete) {
      this.provider.set('VNPAY');
      reference = params.get('vnp_TxnRef');
    } else if (hasMomoFields && isMomoComplete) {
      this.provider.set('MOMO');
      reference = params.get('orderId');
    } else {
      this.provider.set(null);
      this.message.set('Callback thiếu tham số bắt buộc hoặc không được hỗ trợ.');
      this.state.set('invalid');
      return;
    }

    if (!reference) {
      this.state.set('invalid');
      return;
    }

    this.state.set('loading');
    this.http.get<PatientAppointment[]>(`${environment.apiBaseUrl}/appointments/me`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointments) => {
          if (requestId !== this.verificationSequence) return;
          const matches = (appointments ?? []).filter((appointment) =>
            appointment.id === reference || appointment.appointmentCode === reference,
          );
          if (matches.length !== 1) {
            this.message.set(matches.length
              ? 'Mã callback khớp với nhiều lịch hẹn; không thể xác định giao dịch.'
              : 'Backend không tìm thấy lịch hẹn khớp với mã callback.');
            this.state.set('error');
            return;
          }
          this.resolveAppointment(matches[0], params, requestId);
        },
        error: (error: unknown) => {
          if (requestId !== this.verificationSequence) return;
          this.message.set(this.apiError(error, 'Không thể kiểm tra trạng thái thanh toán với Backend.'));
          this.state.set('error');
        },
      });
  }

  private resolveAppointment(appointment: PatientAppointment, params: ParamMap, requestId: number): void {
    const appointmentStatus = appointment.status.toUpperCase();
    const paymentStatus = appointment.paymentStatus.toUpperCase();

    if (['EXPIRED', 'CANCELLED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_CLINIC'].includes(appointmentStatus)) {
      this.message.set(appointment.cancellationReason || 'Lịch hẹn đã hết hạn hoặc bị hủy theo trạng thái Backend.');
      this.state.set('cancelled');
      return;
    }
    if (paymentStatus === 'FAILED') {
      this.message.set(appointment.paymentFailureReason || 'Backend ghi nhận giao dịch thanh toán thất bại.');
      this.state.set('failed');
      return;
    }
    if (paymentStatus !== 'PAID') {
      this.message.set('Backend chưa ghi nhận thanh toán thành công. Vui lòng kiểm tra lại sau.');
      this.state.set('pending');
      return;
    }
    if (appointmentStatus !== 'CONFIRMED') {
      this.message.set('Backend đã ghi nhận thanh toán nhưng lịch hẹn chưa ở trạng thái xác nhận.');
      this.state.set('error');
      return;
    }

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