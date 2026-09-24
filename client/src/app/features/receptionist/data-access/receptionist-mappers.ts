import {
  AppointmentStatus,
  DateOfBirthPrecision,
} from '@shared/enums';
import {
  AvailableWalkInDoctor,
  CheckInResponse,
  CollectCounterPaymentRequest,
  QueueSnapshot,
  QueueStatusChanged,
  ReceptionAppointment,
  WalkInBookingRequest,
  WalkInBookingResponse,
  WalkInPatientSelectionError,
} from '@shared/interfaces';
import {
  CounterPaymentIntent,
  ReceptionAppointmentViewModel,
  ReceptionQueueSummaryViewModel,
  WalkInBookingIntent,
  WalkInDoctorViewModel,
  WalkInPatientCandidateViewModel,
  WalkInSuccessViewModel,
} from '../models/reception-presentation.models';

const ACTIVE_QUEUE_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_CONSULTATION,
]);

export function mapReceptionAppointment(
  dto: ReceptionAppointment,
): ReceptionAppointmentViewModel {
  return {
    id: dto.id,
    appointmentCode: dto.appointmentCode,
    status: dto.status,
    patientName: dto.patientName,
    patientPhone: dto.patientPhone,
    doctorName: dto.doctorName,
    specialtyName: dto.specialtyName,
    roomNumber: dto.roomNumber,
    date: dto.date,
    startTime: dto.startTime,
    endTime: dto.endTime,
    paymentStatus: dto.paymentStatus,
    paymentMethod: dto.paymentMethod,
    totalAmount: dto.totalAmount,
    queueNumber: dto.queueNumber,
    requiresPayment: dto.requiresPayment,
    canCheckIn: dto.canCheckIn,
    blockedReason: dto.blockedReason,
  };
}

export function mapCheckInResult(
  current: ReceptionAppointmentViewModel,
  response: CheckInResponse,
): ReceptionAppointmentViewModel {
  return {
    ...current,
    status: response.status,
    queueNumber: response.queueNumber,
    canCheckIn: false,
    blockedReason: null,
  };
}

export function mapWalkInDoctor(
  dto: AvailableWalkInDoctor,
): WalkInDoctorViewModel {
  return {
    doctorId: dto.doctorId,
    doctorName: dto.doctorName,
    specialtyName: dto.specialtyName,
    roomNumber: dto.roomNumber,
    consultationFee: dto.consultationFee,
    slots: dto.availableSlots.map((slot) => ({ ...slot })),
  };
}

export function mapCounterPaymentIntent(
  intent: CounterPaymentIntent,
): CollectCounterPaymentRequest {
  return {
    method: intent.method,
    amountTendered: intent.amountTendered,
  };
}

export function mapWalkInBookingIntent(
  intent: WalkInBookingIntent,
): WalkInBookingRequest {
  return {
    scheduleId: intent.scheduleId,
    fullName: intent.fullName,
    phone: intent.phone,
    ...(intent.citizenId ? { citizenId: intent.citizenId } : {}),
    ...(intent.patientId ? { patientId: intent.patientId } : {}),
    birthYear: intent.birthYear,
    gender: intent.gender,
    reasonForVisit: intent.reasonForVisit,
    paymentMethod: intent.paymentMethod,
    amountTendered: intent.amountTendered,
  };
}

export function mapPatientCandidates(
  error: WalkInPatientSelectionError,
): readonly WalkInPatientCandidateViewModel[] {
  return error.candidates.map((candidate) => ({
    patientId: candidate.patientId,
    maskedName: maskPatientName(candidate.fullName),
    gender: candidate.gender,
    birthDateLabel: formatCandidateBirthDate(
      candidate.dateOfBirth,
      candidate.dateOfBirthPrecision,
    ),
  }));
}

export function mapWalkInSuccess(
  response: WalkInBookingResponse,
  doctor: WalkInDoctorViewModel | undefined,
): WalkInSuccessViewModel {
  return {
    appointmentCode: response.appointmentCode,
    queueNumber: response.queueNumber,
    patientName: response.receipt.patientName,
    doctorName: response.receipt.doctorName,
    roomNumber: doctor?.roomNumber ?? 'Đang cập nhật',
    receiptCode: response.receipt.receiptCode,
    amount: response.receipt.amount,
    changeAmount: response.receipt.changeAmount,
  };
}

export function reconcileQueueSnapshot(
  snapshot: QueueSnapshot | null,
  event: QueueStatusChanged,
): QueueSnapshot {
  const currentItems = snapshot?.items ?? [];
  const withoutCurrent = currentItems.filter(
    (item) => item.appointmentId !== event.appointmentId,
  );
  const items = ACTIVE_QUEUE_STATUSES.has(event.status)
    ? [...withoutCurrent, event.ticket]
    : withoutCurrent;

  return {
    scope: snapshot?.scope ?? 'RECEPTION',
    date: snapshot?.date ?? event.ticket.queueDate,
    items,
  };
}

export function mapQueueSnapshotToReceptionSummary(
  snapshot: QueueSnapshot,
  updatedAt = new Date(),
): ReceptionQueueSummaryViewModel {
  const activeItems = snapshot.items.filter((item) =>
    ACTIVE_QUEUE_STATUSES.has(item.status),
  );

  return {
    waitingCount: activeItems.filter(
      (item) => item.status === AppointmentStatus.CHECKED_IN,
    ).length,
    inConsultationCount: activeItems.filter(
      (item) => item.status === AppointmentStatus.IN_CONSULTATION,
    ).length,
    updatedAtLabel: new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(updatedAt),
  };
}

function maskPatientName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return parts[0] ? `${parts[0].charAt(0)}.` : 'Ẩn danh';
  }

  return [
    parts[0],
    ...parts.slice(1).map((part) => `${part.charAt(0).toUpperCase()}.`),
  ].join(' ');
}

function formatCandidateBirthDate(
  dateOfBirth: string,
  precision: DateOfBirthPrecision,
): string {
  if (precision === DateOfBirthPrecision.YEAR) {
    return dateOfBirth.slice(0, 4);
  }

  const parsedDate = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime())
    ? dateOfBirth
    : new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(parsedDate);
}
