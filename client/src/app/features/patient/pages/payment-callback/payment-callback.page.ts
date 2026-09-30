import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';

type PaymentProvider = 'VNPAY' | 'MOMO';
type CallbackState = 'loading' | 'invalid' | 'verification-unavailable';

@Component({
  selector: 'app-payment-callback-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <main class="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section class="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-200 px-6 py-7 text-center sm:px-9">
          <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700" aria-hidden="true">
            <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5m0 4h.01" stroke-linecap="round" />
            </svg>
          </div>
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Kết quả thanh toán</p>
          @if (state() === 'loading') {
            <h1 class="mt-2 text-2xl font-bold text-slate-900">Đang kiểm tra giao dịch</h1>
          } @else if (state() === 'invalid') {
            <h1 class="mt-2 text-2xl font-bold text-slate-900">Callback không hợp lệ</h1>
          } @else {
            <h1 class="mt-2 text-2xl font-bold text-slate-900">Chưa thể xác minh thanh toán</h1>
          }
        </div>

        <div class="space-y-6 p-6 sm:p-9">
          @if (state() === 'loading') {
            <div class="flex items-center justify-center gap-3 py-4 text-sm text-slate-600" role="status" aria-live="polite">
              <span class="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-700"></span>
              Đang xác minh với hệ thống thanh toán...
            </div>
          } @else {
            <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
              @if (state() === 'invalid') {
                <p>{{ message() }}</p>
              } @else {
                <p>Đã nhận callback{{ provider() ? ' từ ' + provider() : '' }}, nhưng frontend chưa có API Backend để xác minh giao dịch.</p>
                <p class="mt-2">Không thể xác nhận thanh toán từ tham số trên URL. Trạng thái giao dịch và lịch hẹn chưa được thay đổi.</p>
              }
            </div>
          }

          <div class="grid gap-3 sm:grid-cols-2">
            <button type="button" (click)="goToHistory()" class="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2">
              Xem lịch sử khám
            </button>
            <button type="button" (click)="goHome()" class="min-h-11 rounded-lg bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2">
              Quay lại trang chủ
            </button>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class PaymentCallbackPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state = signal<CallbackState>('loading');
  readonly provider = signal<PaymentProvider | null>(null);
  readonly message = signal('Callback thiếu hoặc không có tham số thanh toán hợp lệ.');

  constructor() {
    this.route.queryParamMap.subscribe((params) => this.readCallback(params));
  }

  goToHistory(): void {
    void this.router.navigate(['/patient/history']);
  }

  goHome(): void {
    void this.router.navigate(['/patient/doctor-search']);
  }

  private readCallback(params: ParamMap): void {
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