import {
  AppointmentStatus,
  CounterPaymentMethod,
  PaymentMethod,
  PaymentStatus,
  QueueSource,
  Gender,
} from '../enums';

export interface LookupAppointmentRequest {
  code?: string;
  phone?: string;
}

export interface ReceptionAppointment {
  id: string;
  appointmentCode: string;
  status: AppointmentStatus;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  doctorId: string;
  doctorName: string;
  specialtyName: string;
  roomNumber: string;
  date: string;
  startTime: string;
  endTime: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  queueNumber: number | null;
  checkedInAt: string | null;
  requiresPayment: boolean;
  canCheckIn: boolean;
  blockedReason: string | null;
}

export interface CheckInResponse {
  appointmentId: string;
  appointmentCode: string;
  status: AppointmentStatus.CHECKED_IN;
  queueNumber: number;
  queueDate: string;
  queueSource: QueueSource.APPOINTMENT;
  doctorId: string;
  doctorName: string;
  roomNumber: string;
  patientName: string;
  checkedInAt: string;
}

export interface CollectCounterPaymentRequest {
  method: CounterPaymentMethod;
  amountTendered: number;
}

export interface CounterPaymentReceipt {
  receiptCode: string;
  transactionCode: string;
  appointmentCode: string;
  patientName: string;
  doctorName: string;
  amount: number;
  amountTendered: number;
  changeAmount: number;
  paymentMethod: CounterPaymentMethod;
  collectedBy: string;
  paidAt: string;
}

export interface AvailableWalkInDoctorsRequest {
  specialtyId?: string;
  doctorName?: string;
}

export interface AvailableWalkInDoctor {
  doctorId: string;
  doctorName: string;
  specialtyName: string;
  roomNumber: string;
  consultationFee: number;
  availableSlots: Array<{
    scheduleId: string;
    startTime: string;
    endTime: string;
  }>;
}

export interface WalkInBookingRequest {
  scheduleId: string;
  fullName: string;
  phone: string;
  birthYear: number;
  gender: Gender;
  reasonForVisit: string;
  paymentMethod: CounterPaymentMethod;
  amountTendered: number;
}

export interface WalkInBookingResponse {
  appointmentId: string;
  appointmentCode: string;
  patientId: string;
  doctorId: string;
  scheduleId: string;
  status: AppointmentStatus.CHECKED_IN;
  paymentStatus: PaymentStatus.PAID;
  queueNumber: number;
  checkedInAt: string;
  receipt: CounterPaymentReceipt;
}
