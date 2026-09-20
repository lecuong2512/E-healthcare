import { AppointmentStatus } from '../enums/appointment-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface ReserveSlotRequest {
  doctorId: string;
  slotId: string;
  userId?: string;
}

export type IReserveSlotRequest = ReserveSlotRequest;

export interface ReserveSlotData {
  doctorId: string;
  slotId: string;
  userId: string;
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
  userId?: string;
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
  patientId?: string;
  reasonForVisit: string;
  paymentMethod: PaymentMethod;
  totalAmount?: number;
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
  checkedInAt?: Date | string | null;
}

export type IAppointmentResponse = AppointmentResponse;
