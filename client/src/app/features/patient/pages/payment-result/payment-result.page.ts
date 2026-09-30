import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentTransactionStatus } from '@shared/enums';
import { PaymentStatusResponse } from '@shared/interfaces';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { EMPTY, catchError, switchMap, takeWhile, timer } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';

type ResultState = 'loading' | 'success' | 'warning' | 'recoverable' | 'error';

@Component({
  selector: 'app-payment-result-page',
  standalone: true,
  imports: [CommonModule, RouterLink, NzAlertModule, NzButtonModule, NzResultModule, NzSpinModule],
  template: `
    <main class="min-h-[calc(100dvh-64px)] bg-slate-50 px-4 py-12">
      <section class="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        @if (state() === 'loading') {
          <nz-spin nzSize="large" nzTip="Đang xác minh trạng thái thanh toán...">
            <div class="h-48"></div>
          </nz-spin>
          <nz-alert
            nzType="info"
            nzShowIcon
            nzMessage="Không đóng trang này"
            nzDescription="Hệ thống chỉ xác nhận lịch hẹn sau khi backend nhận và kiểm tra kết quả từ cổng thanh toán."
          ></nz-alert>
        } @else if (state() === 'success') {
          <nz-result
            nzStatus="success"
            [nzTitle]="status()?.provider === 'PAY_AT_CLINIC' ? 'Lịch khám đã được xác nhận' : 'Thanh toán thành công'"
            nzSubTitle="Lịch khám đã được xác nhận an toàn từ hệ thống."
          >
            <div nz-result-extra>
              <a nz-button nzType="primary" routerLink="/patient/history">Xem lịch khám</a>
            </div>
          </nz-result>
        } @else if (state() === 'warning') {
          <nz-result
            nzStatus="warning"
            nzTitle="Giao dịch đang được đối soát"
            nzSubTitle="Không thanh toán lại. Bộ phận hỗ trợ sẽ xử lý nếu cổng thanh toán đã ghi nhận tiền."
          >
            <div nz-result-extra>
              <button nz-button nzType="primary" (click)="refresh()">Kiểm tra lại</button>
              <a nz-button routerLink="/patient/history">Xem lịch khám</a>
            </div>
          </nz-result>
        } @else if (state() === 'recoverable') {
          <nz-result nzStatus="warning" nzTitle="Lần thanh toán chưa thành công"
            nzSubTitle="Lịch hẹn vẫn đang được giữ. Bạn có thể thử lại, đổi cổng hoặc chuyển sang thanh toán tại viện nếu hệ thống cho phép.">
            <div nz-result-extra class="flex flex-wrap justify-center gap-3">
              <a nz-button nzType="primary" routerLink="/patient/booking" [queryParams]="{ appointmentId: appointmentId }">Khôi phục checkout</a>
              <button nz-button (click)="refresh()">Kiểm tra lại</button>
            </div>
          </nz-result>
        } @else {
          <nz-result
            nzStatus="error"
            nzTitle="Thanh toán chưa hoàn tất"
            [nzSubTitle]="errorMessage() || 'Giao dịch thất bại hoặc đã hết thời gian giữ chỗ.'"
          >
            <div nz-result-extra>
              <button nz-button (click)="refresh()">Kiểm tra lại</button>
              <a nz-button nzType="primary" routerLink="/patient/doctor-search">Đặt lại lịch</a>
              <a nz-button routerLink="/patient/history">Xem lịch sử</a>
            </div>
          </nz-result>
        }

        @if (status(); as payment) {
          <dl class="mx-auto mt-2 grid max-w-md grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
            <dt class="text-slate-500">Mã lịch hẹn</dt>
            <dd class="break-words text-right font-medium text-slate-800">{{ payment.appointmentCode || payment.appointmentId }}</dd>
            <dt class="text-slate-500">Trạng thái lịch</dt>
            <dd class="text-right font-medium text-slate-800">{{ payment.appointmentStatus }}</dd>
            <dt class="text-slate-500">Trạng thái thanh toán</dt>
            <dd class="text-right font-medium text-slate-800">{{ payment.provider === 'PAY_AT_CLINIC' ? payment.paymentStatus : (payment.transactionStatus || payment.paymentStatus) }}</dd>
          </dl>
        }
      </section>
    </main>
  `,
})
export class PaymentResultPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PatientBookingApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly appointmentId =
    this.route.snapshot.queryParamMap.get('appointmentId') ||
    sessionStorage.getItem('pendingPaymentAppointmentId');

  readonly status = signal<PaymentStatusResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly state = computed<ResultState>(() => this.toState(this.status()));

  constructor() {
    if (!this.appointmentId) {
      this.errorMessage.set('Không tìm thấy lịch hẹn cần kiểm tra.');
      return;
    }
    this.poll();
  }

  refresh(): void {
    if (!this.appointmentId) return;
    this.errorMessage.set(null);
    this.api.getPaymentStatus(this.appointmentId).subscribe({
      next: (status) => this.acceptStatus(status),
      error: () => this.errorMessage.set('Không thể tải trạng thái thanh toán.'),
    });
  }

  private poll(): void {
    timer(0, 2_000).pipe(
      switchMap(() => this.api.getPaymentStatus(this.appointmentId!)),
      takeWhile((status) => this.toState(status) === 'loading', true),
      catchError(() => {
        this.errorMessage.set('Không thể tải trạng thái thanh toán. Vui lòng thử lại.');
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((status) => {
      this.acceptStatus(status);
    });
  }

  private toState(status: PaymentStatusResponse | null): ResultState {
    if (!status) return this.errorMessage() ? 'error' : 'loading';
    if (status.provider === PaymentMethod.PAY_AT_CLINIC && status.appointmentStatus === AppointmentStatus.CONFIRMED && status.paymentStatus === PaymentStatus.UNPAID) return 'success';
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
    if (status.appointmentStatus === AppointmentStatus.PENDING_PAYMENT && status.canRetry === true &&
      [PaymentTransactionStatus.FAILED, PaymentTransactionStatus.TIMEOUT].includes(status.transactionStatus as PaymentTransactionStatus)) return 'recoverable';
    if (
      [PaymentTransactionStatus.FAILED, PaymentTransactionStatus.TIMEOUT].includes(
        status.transactionStatus as PaymentTransactionStatus,
      ) ||
      [AppointmentStatus.CANCELLED, AppointmentStatus.EXPIRED].includes(status.appointmentStatus)
    ) return 'error';
    return 'loading';
  }

  private acceptStatus(status: PaymentStatusResponse): void {
    this.status.set(status);
    if (status.appointmentStatus === AppointmentStatus.PENDING_PAYMENT) return;
    // Viewing an older result must never clear a newer checkout's pointer.
    if (sessionStorage.getItem('pendingPaymentAppointmentId') === status.appointmentId) sessionStorage.removeItem('pendingPaymentAppointmentId');
    try {
      const context = JSON.parse(sessionStorage.getItem('pendingPaymentContext') || 'null');
      if (context?.appointmentId === status.appointmentId) sessionStorage.removeItem('pendingPaymentContext');
    } catch { /* Unknown local state is not evidence of a completed checkout. */ }
  }
}
