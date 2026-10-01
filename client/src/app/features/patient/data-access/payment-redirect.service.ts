import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PaymentRedirectService {
  private readonly allowedHosts = new Set([
    'sandbox.vnpayment.vn',
    'pay.vnpay.vn',
    'test-payment.momo.vn',
    'payment.momo.vn',
  ]);

  redirect(paymentUrl: string): void {
    const url = new URL(paymentUrl);
    if (url.protocol !== 'https:' || !this.allowedHosts.has(url.hostname)) {
      throw new Error('Untrusted payment redirect URL.');
    }
    window.location.assign(url.toString());
  }
}
