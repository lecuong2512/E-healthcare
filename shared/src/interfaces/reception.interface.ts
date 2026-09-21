import {
  AppointmentStatus,
  CounterPaymentMethod,
  PaymentMethod,
  PaymentStatus,
  QueueSource,
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
