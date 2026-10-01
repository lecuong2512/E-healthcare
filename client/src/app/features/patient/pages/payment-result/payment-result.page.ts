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
import { EMPTY, catchError, finalize, switchMap, takeWhile, timer } from 'rxjs';
import { PatientBookingApiService } from '../../data-access/patient-booking-api.service';

type ResultState = 'loading' | 'success' | 'warning' | 'recoverable' | 'cancelled' | 'error';

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
            [nzTitle]="isGatewaySuccess() ? 'Giao dịch đã thanh toán, hệ thống đang đồng bộ' : 'Giao dịch đang được đối soát'"
            [nzSubTitle]="isGatewaySuccess()
              ? 'Cổng thanh toán đã ghi nhận giao dịch thành công. Hệ thống đang đồng bộ xác nhận lịch khám, vui lòng không thanh toán lại.'
              : 'Không thanh toán lại. Bộ phận hỗ trợ sẽ xử lý nếu cổng thanh toán đã ghi nhận tiền.'"
          >
            <div nz-result-extra>
              <button nz-button nzType="primary" (click)="refresh()">Kiểm tra lại</button>
              <a nz-button routerLink="/patient/history">Xem lịch khám</a>
            </div>
          </nz-result>
        } @else if (state() === 'recoverable') {
          <nz-result
            nzStatus="warning"
            nzTitle="Lần thanh toán chưa thành công"
            [nzSubTitle]="isUserCancelled()
              ? 'Bạn đã hủy giao dịch trên cổng thanh toán. Lịch hẹn của bạn vẫn đang được giữ chỗ trong thời gian quy định.'
              : 'Lịch hẹn vẫn đang được giữ. Bạn có thể thử lại, đổi cổng hoặc chuyển sang thanh toán tại viện nếu hệ thống cho phép.'"
          >
            <div nz-result-extra class="flex flex-wrap justify-center gap-3">
              <a nz-button nzType="primary" routerLink="/patient/booking" [queryParams]="{ appointmentId: resolvedAppointmentId() || appointmentId }">
                Thử lại thanh toán / Chọn phương thức khác
              </a>
              @if (status()?.canFallbackToClinic) {
                <button nz-button (click)="fallbackToClinic()" [nzLoading]="isSubmitting()">
                  Chuyển sang thanh toán tại viện
                </button>
              }
              <button nz-button nzDanger (click)="cancelPendingPayment()" [nzLoading]="isSubmitting()">
                Hủy giữ chỗ lịch hẹn
              </button>
              <button nz-button (click)="refresh()">Kiểm tra lại</button>
            </div>
          </nz-result>
        } @else if (state() === 'cancelled') {
          <nz-result
            nzStatus="info"
            nzTitle="Đã hủy giữ chỗ lịch hẹn thành công"
            nzSubTitle="Khung giờ khám và mã ưu đãi (nếu có) đã được giải phóng an toàn. Bạn có thể tiến hành đặt lịch mới."
          >
            <div nz-result-extra class="flex flex-wrap justify-center gap-3">
              <a nz-button nzType="primary" routerLink="/patient/doctor-search">Đặt lịch khám mới</a>
              <a nz-button routerLink="/patient/history">Xem lịch sử</a>
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
    this.route.snapshot.queryParamMap.get('orderId') ||
    this.route.snapshot.queryParamMap.get('vnp_TxnRef') ||
    sessionStorage.getItem('pendingPaymentAppointmentId');

  readonly resolvedAppointmentId = signal<string | null>(null);
  readonly status = signal<PaymentStatusResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly isUserCancelled = signal(false);
  readonly isGatewaySuccess = signal(false);
  readonly isCancelled = signal(false);
  readonly isSubmitting = signal(false);
  private readonly pollCount = signal(0);

  readonly state = computed<ResultState>(() => this.toState(this.status()));

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    const resultCode = query.get('resultCode');
    const vnpResponseCode = query.get('vnp_ResponseCode');

    if (vnpResponseCode === '00' || resultCode === '0') {
      this.isGatewaySuccess.set(true);
    }

    if (resultCode === '1006' || vnpResponseCode === '24') {
      this.isUserCancelled.set(true);
    }

    if (!this.appointmentId) {
      this.errorMessage.set('Không tìm thấy lịch hẹn cần kiểm tra.');
      return;
    }
    this.poll();
  }

  refresh(): void {
    const id = this.resolvedAppointmentId() || this.appointmentId;
    if (!id) return;
    this.errorMessage.set(null);
    this.api.getPaymentStatus(id).subscribe({
      next: (status) => this.acceptStatus(status),
      error: () => this.errorMessage.set('Không thể tải trạng thái thanh toán.'),
    });
  }

  fallbackToClinic(): void {
    const id = this.resolvedAppointmentId() || this.appointmentId;
    if (!id || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.api.fallbackToClinic(id).pipe(
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (response) => {
        if (response?.appointmentId) {
          this.resolvedAppointmentId.set(response.appointmentId);
        }
        this.refresh();
      },
      error: (err) => {
        const msg = err?.error?.message || 'Không thể chuyển sang thanh toán tại viện. Vui lòng thử lại.';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(' ') : msg);
      },
    });
  }

  cancelPendingPayment(): void {
    const id = this.resolvedAppointmentId() || this.appointmentId;
    if (!id || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.api.cancelPendingPayment(id).pipe(
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (response) => {
        const pendingApptId = sessionStorage.getItem('pendingPaymentAppointmentId');
        if (pendingApptId === id || pendingApptId === this.appointmentId) {
          sessionStorage.removeItem('pendingPaymentAppointmentId');
        }
        try {
          const context = JSON.parse(sessionStorage.getItem('pendingPaymentContext') || 'null');
          if (context?.appointmentId === id || context?.appointmentId === this.appointmentId) {
            sessionStorage.removeItem('pendingPaymentContext');
          }
        } catch { }

        this.isCancelled.set(true);
        if (response?.appointmentId) {
          this.resolvedAppointmentId.set(response.appointmentId);
        }
        this.status.update((prev) => prev ? {
          ...prev,
          appointmentStatus: AppointmentStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED,
          transactionStatus: PaymentTransactionStatus.SUPERSEDED,
          canRetry: false,
          canFallbackToClinic: false,
        } : null);
      },
      error: (err) => {
        const msg = err?.error?.message || 'Không thể hủy giữ chỗ lịch hẹn. Vui lòng thử lại.';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(' ') : msg);
      },
    });
  }

  private poll(): void {
    const id = this.resolvedAppointmentId() || this.appointmentId!;
    if (this.isUserCancelled()) {
      this.api.getPaymentStatus(id).pipe(
        catchError(() => {
          this.errorMessage.set('Không thể tải trạng thái thanh toán. Vui lòng thử lại.');
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe((status) => {
        this.acceptStatus(status);
      });
      return;
    }

    timer(0, 2_000).pipe(
      switchMap(() => {
        this.pollCount.update((count) => count + 1);
        const pollId = this.resolvedAppointmentId() || this.appointmentId!;
        return this.api.getPaymentStatus(pollId).pipe(
          catchError(() => {
            if (this.isGatewaySuccess() && this.pollCount() < 10) {
              return EMPTY;
            }
            this.errorMessage.set(this.isGatewaySuccess()
              ? 'Giao dịch đã được ghi nhận tại cổng thanh toán. Hệ thống đang đồng bộ cập nhật trạng thái.'
              : 'Không thể tải trạng thái thanh toán. Vui lòng thử lại.');
            return EMPTY;
          }),
        );
      }),
      takeWhile((status) => this.toState(status) === 'loading', true),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((status) => {
      this.acceptStatus(status);
    });
  }

  private toState(status: PaymentStatusResponse | null): ResultState {
    if (this.isCancelled()) return 'cancelled';
    if (!status) {
      if (this.isUserCancelled()) return 'recoverable';
      if (this.isGatewaySuccess() && this.pollCount() < 10) return 'loading';
      if (this.isGatewaySuccess() && this.errorMessage()) return 'warning';
      return this.errorMessage() ? 'error' : 'loading';
    }
    if (status.appointmentStatus === AppointmentStatus.CANCELLED && this.isCancelled()) return 'cancelled';
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
    if (
      status.appointmentStatus === AppointmentStatus.PENDING_PAYMENT &&
      status.canRetry === true &&
      (
        [PaymentTransactionStatus.FAILED, PaymentTransactionStatus.TIMEOUT].includes(status.transactionStatus as PaymentTransactionStatus) ||
        this.isUserCancelled() ||
        (!this.isGatewaySuccess() && this.pollCount() >= 3 && status.transactionStatus === PaymentTransactionStatus.PENDING)
      )
    ) return 'recoverable';
    if (this.isGatewaySuccess() && this.pollCount() >= 10 && status.transactionStatus === PaymentTransactionStatus.PENDING) {
      return 'warning';
    }
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
    if (status.appointmentId) {
      this.resolvedAppointmentId.set(status.appointmentId);
    }
    if (status.appointmentStatus === AppointmentStatus.PENDING_PAYMENT) return;
    // Viewing an older result must never clear a newer checkout's pointer.
    if (sessionStorage.getItem('pendingPaymentAppointmentId') === status.appointmentId) sessionStorage.removeItem('pendingPaymentAppointmentId');
    try {
      const context = JSON.parse(sessionStorage.getItem('pendingPaymentContext') || 'null');
      if (context?.appointmentId === status.appointmentId) sessionStorage.removeItem('pendingPaymentContext');
    } catch { /* Unknown local state is not evidence of a completed checkout. */ }
  }
}
