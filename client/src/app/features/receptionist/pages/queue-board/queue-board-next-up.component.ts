import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { QueueBoardTicketViewModel } from './queue-board.models';

@Component({
  selector: 'app-queue-board-next-up',
  standalone: true,
  templateUrl: './queue-board-next-up.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueBoardNextUpComponent {
  @Input({ required: true })
  tickets: readonly QueueBoardTicketViewModel[] = [];
}
