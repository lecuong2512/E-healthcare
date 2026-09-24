import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Output, inject } from '@angular/core';

import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { WalkinBookingPage } from '../../pages/walkin-booking/walkin-booking.page';

@Component({
  selector: 'app-walk-in-booking-modal',
  standalone: true,
  imports: [WalkinBookingPage],
  template: `
    <div class="fixed inset-0 z-50 bg-slate-950/60 p-2 sm:p-5" role="presentation">
      <section class="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog" aria-modal="true" aria-labelledby="walk-in-modal-title">
        <header class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="walk-in-modal-title" class="text-lg font-bold">Tiếp đón vãng lai (Walk-in Booking)</h2>
          <button type="button" class="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
            [disabled]="facade.walkInSubmitting()" [attr.aria-busy]="facade.walkInSubmitting()"
            (click)="requestClose()">Đóng</button>
        </header>
        <div class="overflow-y-auto">
          <app-walkin-booking-page
            [embedded]="true"
            [doctors]="facade.walkInDoctors()"
            [candidates]="facade.walkInCandidates()"
            [success]="facade.walkInSuccess()"
            [loadingDoctors]="facade.walkInLoadingDoctors()"
            [submitting]="facade.walkInSubmitting()"
            [errorMessage]="facade.walkInError()"
            [slotConflict]="facade.walkInSlotConflict()"
            (doctorSearchRequested)="facade.searchWalkInDoctors($event)"
            (bookingRequested)="facade.createWalkIn($event)"
            (resetRequested)="facade.beginWalkInSession()"
            (closeRequested)="requestClose()"
            (printRequested)="printReceipt()"
          />
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalkInBookingModalComponent {
  protected readonly facade = inject(ReceptionistFacade);
  @Output() closeRequested = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.requestClose();
  }

  requestClose(): void {
    if (this.facade.walkInSubmitting()) return;
    this.closeRequested.emit();
  }

  protected printReceipt(): void {
    window.print();
  }
}
