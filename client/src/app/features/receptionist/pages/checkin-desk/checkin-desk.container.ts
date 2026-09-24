import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';

import { WalkInBookingModalComponent } from '../../components/walk-in-booking-modal/walk-in-booking-modal.component';
import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { CheckinDeskPage } from './checkin-desk.page';

@Component({
  selector: 'app-checkin-desk-container',
  standalone: true,
  imports: [CheckinDeskPage, WalkInBookingModalComponent],
  template: `
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
      (receiptPrintRequested)="printReceipt()"
      (receiptLoadRequested)="facade.loadReceipt($event)"
      (checkInRequested)="facade.checkIn($event)"
      (refreshRequested)="facade.refreshAppointment($event)"
      (queueRefreshRequested)="facade.refreshQueue()"
      (walkInOpenRequested)="openWalkIn()"
    />
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

  ngOnInit(): void {
    this.releaseQueue = this.facade.connectQueue();
  }

  ngOnDestroy(): void {
    this.releaseQueue?.();
    this.releaseQueue = null;
  }

  protected openWalkIn(): void {
    this.facade.beginWalkInSession();
    this.walkInOpen.set(true);
  }

  protected closeWalkIn(): void {
    this.walkInOpen.set(false);
    this.facade.endWalkInSession();
  }

  protected printReceipt(): void {
    window.print();
  }
}
