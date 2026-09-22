import { Injectable } from '@angular/core';

import { QueueBoardStatusEventViewModel } from './queue-board.models';
import { QueueBoardPresentationStore } from './queue-board-presentation.store';

export type QueueBoardEventResult =
  | 'ANNOUNCED'
  | 'COMPLETED'
  | 'IGNORED_DUPLICATE'
  | 'IGNORED_TRANSITION';

const MAX_DEDUPE_ENTRIES = 500;

@Injectable()
export class QueueBoardRealtimeCoordinator {
  private readonly handledEvents = new Set<string>();

  constructor(private readonly store: QueueBoardPresentationStore) {}

  handle(event: QueueBoardStatusEventViewModel): QueueBoardEventResult {
    const eventKey = this.eventKey(event);
    if (this.handledEvents.has(eventKey)) {
      return 'IGNORED_DUPLICATE';
    }

    this.remember(eventKey);

    if (
      event.previousStatus === 'CHECKED_IN' &&
      event.status === 'IN_CONSULTATION'
    ) {
      this.store.announce(event.ticket);
      return 'ANNOUNCED';
    }

    if (event.status === 'COMPLETED') {
      this.store.complete(event.ticket.id);
      return 'COMPLETED';
    }

    return 'IGNORED_TRANSITION';
  }

  resetAfterSnapshot(): void {
    this.handledEvents.clear();
  }

  private eventKey(event: QueueBoardStatusEventViewModel): string {
    return [
      event.ticket.id,
      event.previousStatus ?? 'NONE',
      event.status,
      event.occurredAt,
    ].join(':');
  }

  private remember(eventKey: string): void {
    this.handledEvents.add(eventKey);
    if (this.handledEvents.size <= MAX_DEDUPE_ENTRIES) {
      return;
    }

    const oldestKey = this.handledEvents.values().next().value as
      | string
      | undefined;
    if (oldestKey) {
      this.handledEvents.delete(oldestKey);
    }
  }
}
