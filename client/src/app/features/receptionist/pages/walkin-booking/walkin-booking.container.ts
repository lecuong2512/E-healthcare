import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';

import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { WalkinBookingPage } from './walkin-booking.page';

@Component({
  selector: 'app-walkin-booking-container',
  standalone: true,
  imports: [WalkinBookingPage],
  template: `
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
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalkinBookingContainer implements OnInit {
  protected readonly facade = inject(ReceptionistFacade);

  ngOnInit(): void {
    this.facade.searchWalkInDoctors({ specialtyName: '', doctorName: '' });
  }
}
