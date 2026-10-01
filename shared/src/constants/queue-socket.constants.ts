export const QUEUE_NAMESPACE = '/queue';
export const QUEUE_RECEPTION_ROOM = 'reception';
export const QUEUE_DOCTOR_ROOM = (doctorId: string): string => `doctor:${doctorId}`;
export const QUEUE_PUBLIC_ROOM = 'queue:public';
export const QUEUE_SNAPSHOT_EVENT = 'queue.snapshot';
export const QUEUE_SYNC_EVENT = 'queue.sync';
export const QUEUE_AUTH_EXPIRED_EVENT = 'auth.expired';
export const APPOINTMENT_STATUS_CHANGED_EVENT = 'appointment.status_changed';
export const QUEUE_PUBLIC_STATUS_CHANGED_EVENT = 'queue.public_status_changed';
