import { TestBed } from '@angular/core/testing';

import {
  QueueBoardStatusEventViewModel,
  QueueBoardTicketViewModel,
} from './queue-board.models';
import { QueueBoardPresentationStore } from './queue-board-presentation.store';
import { QueueBoardRealtimeCoordinator } from './queue-board-realtime.coordinator';

const ticket: QueueBoardTicketViewModel = {
  id: 'doctor-1:18:2026-09-22',
  queueNumber: 18,
  maskedPatientName: 'Nguyễn V. A',
  roomNumber: 'P.201',
  specialtyName: 'Tim mạch',
  doctorName: 'Trần Minh Bình',
};

function event(
  previousStatus: QueueBoardStatusEventViewModel['previousStatus'],
  status: QueueBoardStatusEventViewModel['status'],
): QueueBoardStatusEventViewModel {
  return {
    occurredAt: '2026-09-22T03:00:00.000Z',
    previousStatus,
    status,
    ticket,
  };
}

describe('QueueBoardRealtimeCoordinator', () => {
  let store: QueueBoardPresentationStore;
  let coordinator: QueueBoardRealtimeCoordinator;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QueueBoardPresentationStore,
        QueueBoardRealtimeCoordinator,
      ],
    });
    store = TestBed.inject(QueueBoardPresentationStore);
    coordinator = TestBed.inject(QueueBoardRealtimeCoordinator);
  });

  it('announces only CHECKED_IN to IN_CONSULTATION transitions', () => {
    expect(coordinator.handle(event('CHECKED_IN', 'IN_CONSULTATION'))).toBe(
      'ANNOUNCED',
    );
    expect(store.nowServing()[0].id).toBe(ticket.id);
    expect(store.lastCalledTicketId()).toBe(ticket.id);
  });

  it('does not announce snapshot-like or unrelated transitions', () => {
    expect(coordinator.handle(event(null, 'IN_CONSULTATION'))).toBe(
      'IGNORED_TRANSITION',
    );
    expect(store.nowServing()).toEqual([]);
  });

  it('deduplicates a repeated realtime event', () => {
    const statusEvent = event('CHECKED_IN', 'IN_CONSULTATION');

    expect(coordinator.handle(statusEvent)).toBe('ANNOUNCED');
    expect(coordinator.handle(statusEvent)).toBe('IGNORED_DUPLICATE');
    expect(store.nowServing().length).toBe(1);
  });

  it('removes completed tickets from Now Serving', () => {
    store.announce(ticket);

    expect(coordinator.handle(event('IN_CONSULTATION', 'COMPLETED'))).toBe(
      'COMPLETED',
    );
    expect(store.nowServing()).toEqual([]);
  });

  it('allows event keys again after authoritative snapshot reconciliation', () => {
    const statusEvent = event('CHECKED_IN', 'IN_CONSULTATION');
    coordinator.handle(statusEvent);
    coordinator.resetAfterSnapshot();

    expect(coordinator.handle(statusEvent)).toBe('ANNOUNCED');
  });
});
