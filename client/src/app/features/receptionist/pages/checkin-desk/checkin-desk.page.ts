import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  booleanAttribute,
  signal,
} from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import {
  AppointmentStatus,
  CounterPaymentMethod,
  PaymentMethod,
  PaymentStatus,
} from '@shared/enums';
import { CounterPaymentReceipt } from '@shared/interfaces';
import { QrScannerComponent } from '../../../../shared/components/qr-scanner/qr-scanner.component';
import { CurrencyVndPipe } from '../../../../shared/pipes/currency-vnd.pipe';
import {
  CounterPaymentIntent,
  ReceptionAppointmentViewModel,
  ReceptionLookupIntent,
  ReceptionQueueConnectionState,
  ReceptionQueueSummaryViewModel,
} from '../../models/reception-presentation.models';

type LookupMode = 'QR' | 'MANUAL';
type ManualLookupKind = 'APPOINTMENT_CODE' | 'PHONE';

function appointmentsOrEmpty(
  value: readonly ReceptionAppointmentViewModel[] | null | undefined,
): readonly ReceptionAppointmentViewModel[] {
  return value ?? [];
}

function appointmentOrNull(
  value: ReceptionAppointmentViewModel | null | undefined,
): ReceptionAppointmentViewModel | null {
  return value ?? null;
}

function receiptOrNull(
  value: CounterPaymentReceipt | null | undefined,
): CounterPaymentReceipt | null {
  return value ?? null;
}

function queueSummaryOrNull(
  value: ReceptionQueueSummaryViewModel | null | undefined,
): ReceptionQueueSummaryViewModel | null {
  return value ?? null;
}

function queueConnectionOrDisconnected(
  value: ReceptionQueueConnectionState | null | undefined,
): ReceptionQueueConnectionState {
  return value ?? 'disconnected';
}

@Component({
  selector: 'app-checkin-desk-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    QrScannerComponent,
    CurrencyVndPipe,
  ],
  templateUrl: './checkin-desk.page.html',
  styleUrl: './checkin-desk.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckinDeskPage {
  @Input({ transform: appointmentsOrEmpty })
  appointments: readonly ReceptionAppointmentViewModel[] = [];
  @Input({ transform: appointmentOrNull })
  selectedAppointment: ReceptionAppointmentViewModel | null = null;
  @Input({ transform: booleanAttribute }) loading = false;
  @Input({ transform: booleanAttribute }) paymentPending = false;
  @Input({ transform: receiptOrNull })
  receipt: CounterPaymentReceipt | null = null;
  @Input({ transform: booleanAttribute }) checkInPending = false;
  @Input() errorMessage: string | null = null;
  @Input({ transform: queueSummaryOrNull })
  queueSummary: ReceptionQueueSummaryViewModel | null = null;
  @Input({ transform: queueConnectionOrDisconnected })
  queueConnectionState: ReceptionQueueConnectionState = 'disconnected';
  @Output() lookupRequested = new EventEmitter<ReceptionLookupIntent>();
  @Output() appointmentSelected =
    new EventEmitter<ReceptionAppointmentViewModel>();
  @Output() paymentRequested = new EventEmitter<CounterPaymentIntent>();
  @Output() receiptPrintRequested = new EventEmitter<void>();
  @Output() checkInRequested = new EventEmitter<string>();
  @Output() refreshRequested = new EventEmitter<string>();
  @Output() queueRefreshRequested = new EventEmitter<void>();
  @Output() walkInOpenRequested = new EventEmitter<void>();
  @Output() receiptLoadRequested = new EventEmitter<string>();

  readonly lookupMode = signal<LookupMode>('QR');
  readonly manualLookupKind = signal<ManualLookupKind>('APPOINTMENT_CODE');
  readonly cashReceived = signal(0);
  readonly manualQuery = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(64)],
  });
  changeAmount(): number {
    return Math.max(
      0,
      this.cashReceived() - (this.selectedAppointment?.totalAmount ?? 0),
    );
  }

  protected readonly AppointmentStatus = AppointmentStatus;
  protected readonly PaymentStatus = PaymentStatus;
  protected readonly PaymentMethod = PaymentMethod;

  setLookupMode(mode: LookupMode): void {
    this.lookupMode.set(mode);
    this.manualQuery.reset();
  }

  setManualLookupKind(kind: ManualLookupKind): void {
    this.manualLookupKind.set(kind);
    this.manualQuery.reset();
  }

  handleQrScanned(qrToken: string): void {
    this.lookupRequested.emit({ kind: 'QR_TOKEN', value: qrToken });
  }

  submitManualLookup(): void {
    const value = this.manualQuery.value.trim();

    if (!value) {
      this.manualQuery.markAsTouched();
      return;
    }

    const normalizedValue = value.replace(/\s/g, '').replace(/^\+84/, '0');
    const looksLikePhone = /^0\d+$/.test(normalizedValue);
    const lookupKind =
      this.manualLookupKind() === 'PHONE' || looksLikePhone
        ? 'PHONE'
        : 'APPOINTMENT_CODE';

    if (lookupKind === 'PHONE' && !/^0\d{9}$/.test(normalizedValue)) {
      this.manualQuery.setErrors({ phone: true });
      return;
    }

    this.lookupRequested.emit({
      kind: lookupKind,
      value: lookupKind === 'PHONE' ? normalizedValue : value,
    });
  }

  selectAppointment(appointment: ReceptionAppointmentViewModel): void {
    this.cashReceived.set(0);
    this.appointmentSelected.emit(appointment);
  }

  updateCashReceived(event: Event): void {
    const amount = Number((event.target as HTMLInputElement).value);
    this.cashReceived.set(Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }

  collectPayment(): void {
    const appointment = this.selectedAppointment;
    if (
      !appointment ||
      this.cashReceived() < appointment.totalAmount ||
      this.paymentPending ||
      !!this.receipt
    ) {
      return;
    }

    this.paymentRequested.emit({
      appointmentId: appointment.id,
      method: CounterPaymentMethod.CASH,
      amountTendered: this.cashReceived(),
    });
  }

  checkIn(): void {
    const appointment = this.selectedAppointment;
    if (!appointment || !appointment.canCheckIn || this.checkInPending) {
      return;
    }
    this.checkInRequested.emit(appointment.id);
  }

  statusLabel(status: AppointmentStatus): string {
    const labels: Partial<Record<AppointmentStatus, string>> = {
      [AppointmentStatus.CONFIRMED]: 'Đã xác nhận',
      [AppointmentStatus.CHECKED_IN]: 'Đã check-in',
      [AppointmentStatus.IN_CONSULTATION]: 'Đang khám',
      [AppointmentStatus.COMPLETED]: 'Hoàn thành',
      [AppointmentStatus.CANCELLED]: 'Đã hủy',
      [AppointmentStatus.NO_SHOW]: 'Không đến',
    };
    return labels[status] ?? status;
  }

  paymentLabel(status: PaymentStatus): string {
    const labels: Partial<Record<PaymentStatus, string>> = {
      [PaymentStatus.PAID]: 'Đã thanh toán',
      [PaymentStatus.UNPAID]: 'Chưa thanh toán',
      [PaymentStatus.REFUNDED]: 'Đã hoàn tiền',
      [PaymentStatus.FAILED]: 'Thanh toán lỗi',
    };
    return labels[status] ?? status;
  }

  queueConnectionLabel(): string {
    const labels: Record<ReceptionQueueConnectionState, string> = {
      disconnected: 'Chưa kết nối realtime',
      connecting: 'Đang kết nối realtime',
      connected: 'Realtime đang hoạt động',
      reconnecting: 'Đang kết nối lại realtime',
      expired: 'Phiên realtime đã hết hạn',
      error: 'Mất kết nối realtime',
    };
    return labels[this.queueConnectionState];
  }
}
