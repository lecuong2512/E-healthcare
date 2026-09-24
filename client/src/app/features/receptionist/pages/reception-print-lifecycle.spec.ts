import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ReceptionistFacade } from '../data-access/receptionist-facade.service';
import { CheckinDeskContainer } from './checkin-desk/checkin-desk.container';
import { WalkinBookingContainer } from './walkin-booking/walkin-booking.container';

describe('Reception print route lifecycle', () => {
  let facade: {
    printData: ReturnType<typeof signal<null>>;
    clearPrintState: jasmine.Spy;
    connectQueue: jasmine.Spy;
    loadClinicPrintInfo: jasmine.Spy;
    beginWalkInSession: jasmine.Spy;
    endWalkInSession: jasmine.Spy;
  };

  beforeEach(() => {
    facade = {
      printData: signal(null),
      clearPrintState: jasmine.createSpy('clearPrintState'),
      connectQueue: jasmine.createSpy('connectQueue').and.returnValue(jasmine.createSpy('releaseQueue')),
      loadClinicPrintInfo: jasmine.createSpy('loadClinicPrintInfo'),
      beginWalkInSession: jasmine.createSpy('beginWalkInSession'),
      endWalkInSession: jasmine.createSpy('endWalkInSession'),
    };
    TestBed.configureTestingModule({
      imports: [CheckinDeskContainer, WalkinBookingContainer],
      providers: [{ provide: ReceptionistFacade, useValue: facade }],
    });
    TestBed.overrideComponent(CheckinDeskContainer, { set: { template: '' } });
    TestBed.overrideComponent(WalkinBookingContainer, { set: { template: '' } });
  });

  it('clears print state on entry and exit from the check-in route', () => {
    const fixture = TestBed.createComponent(CheckinDeskContainer);
    fixture.detectChanges();
    expect(facade.clearPrintState).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(facade.clearPrintState).toHaveBeenCalledTimes(2);
  });

  it('ends the Walk-in session on route exit', () => {
    const fixture = TestBed.createComponent(WalkinBookingContainer);
    fixture.detectChanges();
    expect(facade.beginWalkInSession).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(facade.endWalkInSession).toHaveBeenCalledTimes(1);
  });
});
