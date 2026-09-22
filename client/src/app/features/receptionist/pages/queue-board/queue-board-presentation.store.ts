import { Injectable, computed, signal } from '@angular/core';

import {
  QueueBoardConnectionState,
  QueueBoardPresentationSnapshot,
  QueueBoardTicketViewModel,
} from './queue-board.models';

const MAX_NEXT_UP_TICKETS = 5;

@Injectable()
export class QueueBoardPresentationStore {
  private readonly _nowServing = signal<
    readonly QueueBoardTicketViewModel[]
  >([]);
  private readonly _nextUp = signal<readonly QueueBoardTicketViewModel[]>([]);
  private readonly _updatedAt = signal<Date | null>(null);
  private readonly _connectionState =
    signal<QueueBoardConnectionState>('disconnected');
  private readonly _lastCalledTicketId = signal<string | null>(null);

  readonly nowServing = this._nowServing.asReadonly();
  readonly nextUp = this._nextUp.asReadonly();
  readonly updatedAt = this._updatedAt.asReadonly();
  readonly connectionState = this._connectionState.asReadonly();
  readonly lastCalledTicketId = this._lastCalledTicketId.asReadonly();
  readonly isEmpty = computed(
    () => this._nowServing().length === 0 && this._nextUp().length === 0,
  );

  hydrate(snapshot: QueueBoardPresentationSnapshot): void {
    this._nowServing.set([...snapshot.nowServing]);
    this._nextUp.set(snapshot.nextUp.slice(0, MAX_NEXT_UP_TICKETS));
    this._updatedAt.set(snapshot.updatedAt);
    this._lastCalledTicketId.set(null);
  }

  announce(ticket: QueueBoardTicketViewModel): void {
    this._nowServing.update((tickets) => [
      ticket,
      ...tickets.filter((item) => item.id !== ticket.id),
    ]);
    this._nextUp.update((tickets) =>
      tickets.filter((item) => item.id !== ticket.id),
    );
    this._lastCalledTicketId.set(ticket.id);
    this._updatedAt.set(new Date());
  }

  setConnectionState(state: QueueBoardConnectionState): void {
    this._connectionState.set(state);
  }

  clearAnnouncement(): void {
    this._lastCalledTicketId.set(null);
  }
}
