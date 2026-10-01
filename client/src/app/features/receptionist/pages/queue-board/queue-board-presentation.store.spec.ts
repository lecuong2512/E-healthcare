import { TestBed } from '@angular/core/testing';

import { QueueBoardTicketViewModel } from './queue-board.models';
import { QueueBoardPresentationStore } from './queue-board-presentation.store';

function ticket(id: string, queueNumber: number): QueueBoardTicketViewModel {
  return {
    id,
    queueNumber,
    maskedPatientName: 'Nguyễn V. A',
    roomNumber: 'P.201',
    specialtyName: 'Tim mạch',
    doctorName: 'Trần Minh An',
  };
}

describe('QueueBoardPresentationStore', () => {
  let store: QueueBoardPresentationStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QueueBoardPresentationStore],
    });
    store = TestBed.inject(QueueBoardPresentationStore);
  });

  it('hydrates a snapshot without triggering an announcement', () => {
    store.hydrate({
      nowServing: [ticket('serving', 12)],
      nextUp: [ticket('next', 13)],
      updatedAt: new Date('2026-09-22T08:00:00Z'),
    });

    expect(store.nowServing().map((item) => item.id)).toEqual(['serving']);
    expect(store.nextUp().map((item) => item.id)).toEqual(['next']);
    expect(store.lastCalledTicketId()).toBeNull();
  });

  it('limits Next Up to five tickets', () => {
    store.hydrate({
      nowServing: [],
      nextUp: Array.from({ length: 7 }, (_, index) =>
        ticket(String(index), index + 1),
      ),
      updatedAt: null,
    });

    expect(store.nextUp().length).toBe(5);
    expect(store.nextUp().map((item) => item.queueNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('moves a called ticket out of Next Up and marks it for effects', () => {
    const calledTicket = ticket('called', 20);
    store.hydrate({
      nowServing: [ticket('existing', 19)],
      nextUp: [calledTicket, ticket('later', 21)],
      updatedAt: null,
    });

    store.announce(calledTicket);

    expect(store.nowServing().map((item) => item.id)).toEqual([
      'called',
      'existing',
    ]);
    expect(store.nextUp().map((item) => item.id)).toEqual(['later']);
    expect(store.lastCalledTicketId()).toBe('called');
  });
});
