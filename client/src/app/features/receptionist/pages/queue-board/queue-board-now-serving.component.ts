import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { QueueBoardTicketViewModel } from './queue-board.models';

@Component({
  selector: 'app-queue-board-now-serving',
  standalone: true,
  templateUrl: './queue-board-now-serving.component.html',
  styleUrl: './queue-board-now-serving.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueBoardNowServingComponent {
  @Input({ required: true })
  tickets: readonly QueueBoardTicketViewModel[] = [];

  @Input() lastCalledTicketId: string | null = null;
}
