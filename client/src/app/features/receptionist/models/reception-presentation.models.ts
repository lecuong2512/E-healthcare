import {
  AppointmentStatus,
  Gender,
  PaymentStatus,
} from '@shared/enums';

export type ReceptionLookupKind = 'QR_TOKEN' | 'APPOINTMENT_CODE' | 'PHONE';

export interface ReceptionLookupIntent {
  readonly kind: ReceptionLookupKind;
  readonly value: string;
}

export interface ReceptionAppointmentViewModel {
  readonly id: string;
  readonly appointmentCode: string;
  readonly status: AppointmentStatus;
  readonly patientName: string;
  readonly patientPhone: string | null;
  readonly doctorName: string;
  readonly specialtyName: string;
  readonly roomNumber: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly paymentStatus: PaymentStatus;
  readonly totalAmount: number;
  readonly queueNumber: number | null;
  readonly requiresPayment: boolean;
  readonly canCheckIn: boolean;
  readonly blockedReason: string | null;
}

export interface CounterPaymentIntent {
  readonly appointmentId: string;
  readonly amountTendered: number;
}

export type ReceptionQueueConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'expired'
  | 'error';

/** Non-PII summary rendered at the receptionist desk. */
export interface ReceptionQueueSummaryViewModel {
  readonly waitingCount: number;
  readonly inConsultationCount: number;
  readonly lastIssuedQueueNumber: number | null;
  readonly updatedAtLabel: string;
}

export interface WalkInDoctorViewModel {
  readonly doctorId: string;
  readonly doctorName: string;
  readonly specialtyName: string;
  readonly roomNumber: string;
  readonly consultationFee: number;
  readonly slots: readonly WalkInSlotViewModel[];
}

export interface WalkInDoctorSearchIntent {
  readonly specialtyName: string;
  readonly doctorName: string;
}

/**
 * Draft captured from the compact receptionist workspace before the
 * full patient/payment confirmation flow is opened.
 */
export interface WalkInDraftIntent {
  readonly fullName: string;
  readonly phone: string;
  readonly specialtyName: string;
  readonly doctorId: string;
  readonly scheduleId: string;
}

export interface WalkInSlotViewModel {
  readonly scheduleId: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface WalkInPatientCandidateViewModel {
  readonly patientId: string;
  readonly maskedName: string;
  readonly gender: Gender;
  readonly birthDateLabel: string;
}

export interface WalkInBookingIntent {
  readonly idempotencyKey: string;
  readonly scheduleId: string;
  readonly fullName: string;
  readonly phone: string;
  readonly citizenId: string;
  readonly birthYear: number;
  readonly gender: Gender;
  readonly reasonForVisit: string;
  readonly amountTendered: number;
  readonly patientId?: string;
}

export interface WalkInSuccessViewModel {
  readonly appointmentCode: string;
  readonly queueNumber: number;
  readonly patientName: string;
  readonly doctorName: string;
  readonly roomNumber: string;
  readonly receiptCode: string;
}
