import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  viewChild,
  effect,
  afterNextRender,
  Injector,
} from '@angular/core';

import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { WalkinBookingPage } from './walkin-booking.page';
import { PrintReceiptComponent } from '../../../../shared/components/print-receipt/print-receipt.component';
import { PrintReceiptData } from '../../models/reception-print.model';

@Component({
  selector: 'app-walkin-booking-container',
  standalone: true,
  imports: [WalkinBookingPage, PrintReceiptComponent],
  template: `
    @if (facade.printError()) {
      <div role="alert" class="m-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{{ facade.printError() }}</div>
    }
    <app-walkin-booking-page
      [doctors]="facade.walkInDoctors()"
      [candidates]="facade.walkInCandidates()"
      [success]="facade.walkInSuccess()"
      [draft]="facade.walkInDraft()"
      [loadingDoctors]="facade.walkInLoadingDoctors()"
      [submitting]="facade.walkInSubmitting()"
      [errorMessage]="facade.walkInError()"
      [slotConflict]="facade.walkInSlotConflict()"
      (doctorSearchRequested)="facade.searchWalkInDoctors($event)"
      (bookingRequested)="facade.createWalkIn($event)"
      (resetRequested)="facade.resetWalkIn()"
      (printRequested)="facade.prepareWalkInPaymentPrint()"
    />
    @if (facade.printData(); as data) {
      <app-print-receipt [data]="data" class="receipt-print-source" aria-hidden="true" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalkinBookingContainer implements OnInit, OnDestroy {
  protected readonly facade = inject(ReceptionistFacade);
  private readonly printer = viewChild(PrintReceiptComponent);
  private readonly injector = inject(Injector);
  private printedData: PrintReceiptData | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const data = this.facade.printData();
      const printer = this.printer();
      if (!data || !printer || data === this.printedData) return;
      this.printedData = data;
      afterNextRender(() => {
        if (!this.destroyed && this.facade.printData() === data && printer.data() === data) {
          void printer.print().catch((error: unknown) => {
            if (!this.destroyed) this.facade.reportPrintError(error);
          });
        }
      }, { injector: this.injector });
    });
  }

  ngOnInit(): void {
    this.facade.beginWalkInSession();
    this.facade.loadClinicPrintInfo();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.facade.endWalkInSession();
  }
}
