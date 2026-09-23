import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { WalkInDraftIntent } from '../../models/reception-presentation.models';
import { CheckinDeskPage } from './checkin-desk.page';

@Component({
  selector: 'app-checkin-desk-container',
  standalone: true,
  imports: [CheckinDeskPage],
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
      [walkInDoctors]="facade.walkInDoctors()"
      [walkInPending]="facade.walkInSubmitting()"
      (lookupRequested)="facade.lookup($event)"
      (appointmentSelected)="facade.selectAppointment($event)"
      (paymentRequested)="facade.collectPayment($event)"
      (receiptPrintRequested)="printReceipt()"
      (checkInRequested)="facade.checkIn($event)"
      (refreshRequested)="facade.refreshAppointment($event)"
      (queueRefreshRequested)="facade.refreshQueue()"
      (walkInDraftRequested)="openWalkIn($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckinDeskContainer implements OnInit, OnDestroy {
  protected readonly facade = inject(ReceptionistFacade);
  private readonly router = inject(Router);
  private releaseQueue: (() => void) | null = null;

  ngOnInit(): void {
    this.facade.searchWalkInDoctors({ specialtyName: '', doctorName: '' });
    this.releaseQueue = this.facade.connectQueue();
  }

  ngOnDestroy(): void {
    this.releaseQueue?.();
    this.releaseQueue = null;
  }

  protected openWalkIn(draft: WalkInDraftIntent): void {
    this.facade.setWalkInDraft(draft);
    void this.router.navigate(['/receptionist/walkin']);
  }

  protected printReceipt(): void {
    window.print();
  }
}
