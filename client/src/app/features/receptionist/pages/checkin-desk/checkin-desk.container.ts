import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  viewChild,
  effect,
  afterNextRender,
  Injector,
  inject,
  signal,
} from '@angular/core';

import { WalkInBookingModalComponent } from '../../components/walk-in-booking-modal/walk-in-booking-modal.component';
import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { CheckinDeskPage } from './checkin-desk.page';
import { PrintReceiptComponent } from '../../../../shared/components/print-receipt/print-receipt.component';
import { PrintReceiptData } from '../../models/reception-print.model';

@Component({
  selector: 'app-checkin-desk-container',
  standalone: true,
  imports: [CheckinDeskPage, WalkInBookingModalComponent, PrintReceiptComponent],
  template: `
    @if (facade.printError()) {
      <div role="alert" class="m-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{{ facade.printError() }} Có thể in lại phiếu.</div>
    }
    <app-checkin-desk-page
      [appointments]="facade.appointments()"
      [selectedAppointment]="facade.selectedAppointment()"
      [loading]="facade.loading()"
      [paymentPending]="facade.paymentPending()"
      [receipt]="facade.lastReceipt()"
      [checkInPending]="facade.checkInPending()"
      [errorMessage]="facade.checkInError()"
      [queueSummary]="facade.queueSummary()"
      [queueConnectionState]="facade.queueConnectionState()"
      (lookupRequested)="facade.lookup($event)"
      (appointmentSelected)="facade.selectAppointment($event)"
      (paymentRequested)="facade.collectPayment($event)"
      (receiptPrintRequested)="facade.loadReceipt($event)"
      (checkinPrintRequested)="facade.prepareCheckinPrint($event)"
      (receiptLoadRequested)="facade.loadReceipt($event)"
      (checkInRequested)="facade.checkIn($event)"
      (refreshRequested)="facade.refreshAppointment($event)"
      (queueRefreshRequested)="facade.refreshQueue()"
      (walkInOpenRequested)="openWalkIn()"
    />
    @if (facade.printData(); as data) {
      <app-print-receipt [data]="data" class="receipt-print-source" aria-hidden="true" />
    }
    @if (walkInOpen()) {
      <app-walk-in-booking-modal (closeRequested)="closeWalkIn()" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckinDeskContainer implements OnInit, OnDestroy {
  protected readonly facade = inject(ReceptionistFacade);
  protected readonly walkInOpen = signal(false);
  private releaseQueue: (() => void) | null = null;
  private readonly printer = viewChild(PrintReceiptComponent);
  private readonly injector = inject(Injector);
  private printedData: PrintReceiptData | null = null;

  constructor() {
    effect(() => {
      const data = this.facade.printData();
      const printer = this.printer();
      if (!data || !printer || data === this.printedData) return;
      this.printedData = data;
      afterNextRender(() => {
        if (this.facade.printData() === data && printer.data() === data) {
          void printer.print().catch((error: unknown) => this.facade.reportPrintError(error));
        }
      }, { injector: this.injector });
    });
  }

  ngOnInit(): void {
    this.releaseQueue = this.facade.connectQueue();
    this.facade.loadClinicPrintInfo();
  }

  ngOnDestroy(): void {
    this.releaseQueue?.();
    this.releaseQueue = null;
  }

  openWalkIn(): void {
    this.facade.beginWalkInSession();
    this.walkInOpen.set(true);
  }

  closeWalkIn(): void {
    if (this.facade.walkInSubmitting()) return;
    this.walkInOpen.set(false);
    this.facade.endWalkInSession();
  }

}
