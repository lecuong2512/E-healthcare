import { PublicQueueTicket, QueueTicket } from '@shared/interfaces';

export function maskPatientName(name: string): string {
  return name.trim().normalize('NFC').split(/\s+/u).map((word, index) => {
    const characters = Array.from(word);
    const visible = index === 0 ? Math.min(4, Math.max(1, characters.length - 1)) : 1;
    return characters.slice(0, visible).join('') + '*'.repeat(characters.length - visible);
  }).join(' ');
}

export function toPublicQueueTicket(ticket: QueueTicket): PublicQueueTicket {
  return {
    doctorId: ticket.doctorId,
    doctorName: ticket.doctorName,
    roomNumber: ticket.roomNumber,
    maskedPatientName: maskPatientName(ticket.patientName),
    status: ticket.status,
    queueNumber: ticket.queueNumber,
    queueDate: ticket.queueDate,
  };
}
