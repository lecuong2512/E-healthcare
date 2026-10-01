import {
  PublicQueueSnapshot,
  PublicQueueStatusChanged,
  PublicQueueTicket,
} from '@shared/interfaces';

import {
  QueueBoardPresentationSnapshot,
  QueueBoardStatusEventViewModel,
  QueueBoardTicketStatus,
  QueueBoardTicketViewModel,
} from './queue-board.models';

export function mapPublicQueueTicket(
  ticket: PublicQueueTicket,
): QueueBoardTicketViewModel {
  return {
    id: `${ticket.doctorId}:${ticket.queueDate}:${ticket.queueNumber}`,
    queueNumber: ticket.queueNumber,
    maskedPatientName: ticket.maskedPatientName,
    roomNumber: ticket.roomNumber,
    specialtyName: ticket.specialtyName,
    doctorName: ticket.doctorName,
  };
}

export function mapPublicQueueSnapshot(
  snapshot: PublicQueueSnapshot,
): QueueBoardPresentationSnapshot {
  return {
    nowServing: snapshot.items
      .filter((ticket) => ticket.status === 'IN_CONSULTATION')
      .map(mapPublicQueueTicket),
    nextUp: snapshot.items
      .filter((ticket) => ticket.status === 'CHECKED_IN')
      .map(mapPublicQueueTicket),
    updatedAt: new Date(),
  };
}

export function mapPublicQueueStatusChanged(
  event: PublicQueueStatusChanged,
): QueueBoardStatusEventViewModel | null {
  if (
    !isQueueBoardStatus(event.status) ||
    (event.previousStatus !== null && !isQueueBoardStatus(event.previousStatus))
  ) {
    return null;
  }

  return {
    occurredAt: event.occurredAt,
    previousStatus: event.previousStatus,
    status: event.status,
    ticket: mapPublicQueueTicket(event.ticket),
  };
}

function isQueueBoardStatus(status: string): status is QueueBoardTicketStatus {
  return [
    'CONFIRMED',
    'CHECKED_IN',
    'IN_CONSULTATION',
    'COMPLETED',
  ].includes(status);
}
