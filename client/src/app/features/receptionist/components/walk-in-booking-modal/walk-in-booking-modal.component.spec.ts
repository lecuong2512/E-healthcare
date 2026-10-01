import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ReceptionistFacade } from '../../data-access/receptionist-facade.service';
import { CheckinDeskContainer } from '../../pages/checkin-desk/checkin-desk.container';
import { WalkInBookingModalComponent } from './walk-in-booking-modal.component';

describe('Walk-in modal submission guard', () => {
  const submitting = signal(false);
  const facade = {
    walkInSubmitting: submitting.asReadonly(),
    beginWalkInSession: jasmine.createSpy('beginWalkInSession'),
    endWalkInSession: jasmine.createSpy('endWalkInSession'),
  };

  beforeEach(() => {
    submitting.set(false);
    facade.beginWalkInSession.calls.reset();
    facade.endWalkInSession.calls.reset();
    TestBed.configureTestingModule({
      providers: [{ provide: ReceptionistFacade, useValue: facade }],
    });
  });

  it('blocks both close button and Escape while a walk-in request is pending', () => {
    const modal = TestBed.runInInjectionContext(() => new WalkInBookingModalComponent());
    const closed = jasmine.createSpy('closed');
    modal.closeRequested.subscribe(closed);

    submitting.set(true);
    modal.requestClose();
    modal.closeOnEscape();
    expect(closed).not.toHaveBeenCalled();

    submitting.set(false);
    modal.requestClose();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal session alive if a close event reaches the container during submission', () => {
    const container = TestBed.runInInjectionContext(() => new CheckinDeskContainer());
    container.openWalkIn();
    submitting.set(true);
    container.closeWalkIn();
    expect(facade.endWalkInSession).not.toHaveBeenCalled();

    submitting.set(false);
    container.closeWalkIn();
    expect(facade.endWalkInSession).toHaveBeenCalledTimes(1);
  });
});
