import { AppointmentStatus } from '../enums/appointment-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface ReserveSlotRequest {
  doctorId: string;
  slotId: string;
}

export type IReserveSlotRequest = ReserveSlotRequest;

export interface ReserveSlotData {
  doctorId: string;
  slotId: string;
  reservationId: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface ReserveSlotResponse {
  success: boolean;
  message: string;
  data: ReserveSlotData;
}

export type IReserveSlotResponse = ReserveSlotResponse;

export interface ReleaseSlotRequest {
  doctorId: string;
  slotId: string;
  reservationId: string;
}

export type IReleaseSlotRequest = ReleaseSlotRequest;

export interface ReleaseSlotResponse {
  success: boolean;
  message: string;
}

export type IReleaseSlotResponse = ReleaseSlotResponse;

export interface ConfirmBookingRequest {
  doctorId: string;
  slotId: string;
  reservationId: string;
  reasonForVisit: string;
  paymentMethod: PaymentMethod;
  voucherCode?: string;
  bookingFor?: 'self' | 'other';
  patientName?: string;
  patientPhone?: string;
  patientDob?: string;
  patientGender?: string;
}

export type IConfirmBookingRequest = ConfirmBookingRequest;

export interface AppointmentResponse {
  id: string;
  appointmentCode: string;
  patientId: string;
  doctorId: string;
  scheduleId: string;
  status: AppointmentStatus;
  reasonForVisit: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  discountAmount?: number;
  finalAmount?: number;
  voucherCode?: string | null;
  checkedInAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  cancellationReason?: string | null;
  refundAmount?: number;
  refundPercent?: number;
  patient?: {
    id: string;
    fullName: string;
    phoneNumber?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
  };
}

export type IAppointmentResponse = AppointmentResponse;

export interface CancelAppointmentRequest {
  reason?: string;
}

export interface VoucherResponse {
  id: string;
  code: string;
  discountPercent: number;
  isUsed: boolean;
  expiresAt: Date | string;
}
