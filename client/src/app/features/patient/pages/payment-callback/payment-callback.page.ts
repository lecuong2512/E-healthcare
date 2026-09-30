import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { toDataURL } from 'qrcode';
import { environment } from '../../../../../environments/environment';
import { CurrencyVndPipe } from '../../../../shared/pipes/currency-vnd.pipe';

type PaymentProvider = 'VNPAY' | 'MOMO';
type CallbackState = 'loading' | 'invalid' | 'verification-unavailable' | 'success';

interface VerifiedPaymentResult {
  appointment: {
    appointmentCode: string;
    doctorName: string;
    scheduleLabel: string;
    qrPayload: string;
  };
  payment: {
    paidAmount: number;
    bankTransactionId: string;
  };
}

@Component({
  selector: 'app-payment-callback-page',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyVndPipe],
  templateUrl: './payment-callback.page.html',
})
export class PaymentCallbackPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state = signal<CallbackState>('loading');
  readonly provider = signal<PaymentProvider | null>(null);
  readonly message = signal('Callback thiếu hoặc không có tham số thanh toán hợp lệ.');
  readonly showDemoControls = !environment.production;
  readonly verifiedPayment = signal<VerifiedPaymentResult | null>(null);
  readonly qrDataUrl = signal('');

  constructor() {
    this.route.queryParamMap.subscribe((params) => this.readCallback(params));
  }

  async simulateBackendSuccess(): Promise<void> {
    if (!this.showDemoControls) return;

    const response: VerifiedPaymentResult = {
      appointment: {
        appointmentCode: 'DEMO-APT-20261002-001',
        doctorName: 'BS. Nguyễn Minh Anh',
        scheduleLabel: '09:30 - 10:00, 02/10/2026',
        qrPayload: 'DEMO-CHECK-IN:DEMO-APT-20261002-001',
      },
      payment: {
        paidAmount: 350000,
        bankTransactionId: 'DEMO-BANK-TXN-000001',
      },
    };

    this.state.set('loading');
    try {
      const qrDataUrl = await toDataURL(response.appointment.qrPayload, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      this.verifiedPayment.set(response);
      this.qrDataUrl.set(qrDataUrl);
      this.state.set('success');
    } catch {
      this.message.set('Không thể tạo ảnh QR mô phỏng. Vui lòng thử lại.');
      this.state.set('verification-unavailable');
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

  private readCallback(params: ParamMap): void {
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

    if (hasVnpayFields && isVnpayComplete) {
      this.provider.set('VNPAY');
    } else if (hasMomoFields && isMomoComplete) {
      this.provider.set('MOMO');
    } else {
      this.provider.set(null);
      this.message.set('Callback thiếu tham số bắt buộc hoặc không được hỗ trợ.');
      this.state.set('invalid');
      return;
    }

    // Provider query values, including success codes and signatures, are not proof of payment.
    this.state.set('verification-unavailable');
  }
}