import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-payment-qr-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-slate-100 px-4 py-8 flex items-center justify-center">
      <div class="w-full max-w-[540px] bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
        <div class="bg-sky-600 px-6 py-5 text-white text-center">
          <div class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/15 border border-white/30">
            <svg viewBox="0 0 24 24" class="h-8 w-8 text-white" fill="none" stroke="currentColor" stroke-width="2.8">
              <path d="M5 12.5l4.2 4.2L18.7 3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1 class="text-3xl font-bold">Thanh toán!</h1>
        </div>

        <div class="p-6 space-y-5">
          <p class="text-center text-sm text-slate-500">
            Lịch hẹn của bạn đã được xác nhận. Vui lòng thanh toán theo phương thức đã chọn để hoàn tất đặt lịch.
          </p>

          <div class="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
            <div class="flex items-center justify-between gap-3">
              <span class="text-slate-500">Mã lịch hẹn</span>
              <span class="font-bold text-slate-900">APT-{{ bookingCode }}</span>
            </div>
            <div class="mt-3 flex items-center justify-between gap-3">
              <span class="text-slate-500">Phương thức</span>
              <span class="font-semibold text-sky-700 uppercase">{{ paymentMethod }}</span>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5">
            <div class="flex justify-center">
              <div class="grid h-52 w-52 place-items-center rounded-2xl border-4 border-slate-200 bg-white shadow-inner">
                <div class="grid h-44 w-44 place-items-center rounded-xl bg-[radial-gradient(circle,_#fff_0%,_#f8fafc_45%,_#e2e8f0_100%)] text-center text-[10px] font-bold tracking-[0.24em] text-slate-500">
                  <div>
                    <div class="text-[26px] leading-none">QR</div>
                    <div class="mt-2">PAYMENT</div>
                  </div>
                </div>
              </div>
            </div>
            <p class="mt-4 text-center text-xs text-slate-500">
              Quét mã QR để thanh toán nhanh chóng và an toàn.
            </p>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="goToHistory()" class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Xem lịch sử
            </button>
            <button type="button" (click)="confirmPayment()" class="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700">
              Tôi đã thanh toán
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PaymentQrPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly paymentMethod = this.route.snapshot.paramMap.get('method') ?? 'vnpay';
  readonly bookingCode = `202609${Math.floor(Math.random() * 9000 + 1000)}`;

  goToHistory() {
    this.router.navigate(['/patient/history']);
  }

  confirmPayment() {
    this.router.navigate(['/patient/history']);
  }
}
