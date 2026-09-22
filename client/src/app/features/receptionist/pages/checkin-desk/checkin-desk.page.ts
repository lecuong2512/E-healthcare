import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AppointmentStatus, PaymentStatus } from '@shared/enums';
import { QrScannerComponent } from '../../../../shared/components/qr-scanner/qr-scanner.component';
import { CurrencyVndPipe } from '../../../../shared/pipes/currency-vnd.pipe';
import {
  CounterPaymentIntent,
  ReceptionAppointmentViewModel,
  ReceptionLookupIntent,
} from '../../models/reception-presentation.models';

type LookupMode = 'QR' | 'MANUAL';
type ManualLookupKind = 'APPOINTMENT_CODE' | 'PHONE';

@Component({
  selector: 'app-checkin-desk-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    QrScannerComponent,
    CurrencyVndPipe,
  ],
  templateUrl: './checkin-desk.page.html',
  styleUrl: './checkin-desk.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckinDeskPage {
  @Input() appointments: readonly ReceptionAppointmentViewModel[] = [];
  @Input() selectedAppointment: ReceptionAppointmentViewModel | null = null;
  @Input() loading = false;
  @Input() paymentPending = false;
  @Input() checkInPending = false;
  @Input() errorMessage: string | null = null;

  @Output() lookupRequested = new EventEmitter<ReceptionLookupIntent>();
  @Output() appointmentSelected =
    new EventEmitter<ReceptionAppointmentViewModel>();
  @Output() paymentRequested = new EventEmitter<CounterPaymentIntent>();
  @Output() checkInRequested = new EventEmitter<string>();
  @Output() refreshRequested = new EventEmitter<string>();

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

    if (
      this.manualLookupKind() === 'PHONE' &&
      !/^(0|\+84)\d{9}$/.test(value.replace(/\s/g, ''))
    ) {
      this.manualQuery.setErrors({ phone: true });
      return;
    }

    this.lookupRequested.emit({
      kind: this.manualLookupKind(),
      value,
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
      this.paymentPending
    ) {
      return;
    }

    this.paymentRequested.emit({
      appointmentId: appointment.id,
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
}
