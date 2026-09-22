/**
 * Presentation-only model for the TV board. It is intentionally not an API
 * DTO. The public queue adapter will map shared contract types into this shape
 * after the Backend/shared PR is merged into develop.
 */
export interface QueueBoardTicketViewModel {
  readonly id: string;
  readonly queueNumber: number;
  readonly maskedPatientName: string;
  readonly roomNumber: string;
  readonly specialtyName: string;
  readonly doctorName: string;
}

export type QueueBoardConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface QueueBoardPresentationSnapshot {
  readonly nowServing: readonly QueueBoardTicketViewModel[];
  readonly nextUp: readonly QueueBoardTicketViewModel[];
  readonly updatedAt: Date | null;
}
