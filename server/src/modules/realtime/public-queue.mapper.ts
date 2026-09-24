import { PublicQueueTicket, QueueTicket } from '@shared/interfaces';

export function maskPatientName(name: string): string {
  const words = name.trim().normalize('NFC').split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return `${Array.from(words[0])[0]}.`;
  return words.map((word, index) => index === 0
    ? word
    : `${Array.from(word)[0]}.`).join(' ');
}

export function toPublicQueueTicket(ticket: QueueTicket): PublicQueueTicket {
  return {
    doctorId: ticket.doctorId,
    doctorName: ticket.doctorName,
    specialtyName: ticket.specialtyName,
    roomNumber: ticket.roomNumber,
    maskedPatientName: maskPatientName(ticket.patientName),
    status: ticket.status,
    queueNumber: ticket.queueNumber,
    queueDate: ticket.queueDate,
  };
}
