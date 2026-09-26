import { AppointmentStatus, QueueSource } from '../enums';

export interface QueueTicket {
  appointmentId: string;
  appointmentCode: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  roomNumber: string;
  status: AppointmentStatus;
  queueNumber: number;
  queueDate: string;
  queueSource: QueueSource;
  checkedInAt: string;
}

export interface QueueSnapshot {
  scope: 'RECEPTION' | 'DOCTOR';
  doctorId?: string;
  date: string;
  items: QueueTicket[];
}

export interface QueueStatusChanged {
  appointmentId: string;
  appointmentCode: string;
  doctorId: string;
  previousStatus: AppointmentStatus | null;
  status: AppointmentStatus;
  queueNumber: number;
  source: 'RECEPTION_CHECKIN' | 'WALK_IN';
  occurredAt: string;
  ticket: QueueTicket;
}

export interface PublicQueueTicket {
  doctorId: string;
  doctorName: string;
  roomNumber: string;
  maskedPatientName: string;
  status: AppointmentStatus;
  queueNumber: number;
  queueDate: string;
}

export interface PublicQueueSnapshot {
  scope: 'PUBLIC';
  date: string;
  items: PublicQueueTicket[];
}

export interface PublicQueueStatusChanged {
  doctorId: string;
  queueNumber: number;
  previousStatus: AppointmentStatus | null;
  status: AppointmentStatus;
  occurredAt: string;
  ticket: PublicQueueTicket;
}

export interface PublicQueueBoardToken {
  token: string;
  expiresAt: string;
}
