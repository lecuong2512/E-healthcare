import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '../enums';

export interface InitiatePaymentRequest {
  provider: PaymentMethod.VNPAY | PaymentMethod.MOMO;
  supersedeActive?: boolean;
}

export interface InitiatePaymentResponse {
  transactionId: string;
  appointmentId: string;
  provider: PaymentMethod.VNPAY | PaymentMethod.MOMO;
  merchantTransactionId: string;
  paymentUrl: string;
  expiresAt: Date | string;
}

export interface PaymentStatusResponse {
  appointmentId: string;
  appointmentCode?: string;
  idempotencyKey?: string;
  failureCode?: string | null;
  canRetry?: boolean;
  canSwitchProvider?: boolean;
  canFallbackToClinic?: boolean;
  appointmentStatus: AppointmentStatus;
  paymentStatus: PaymentStatus;
  provider: PaymentMethod;
  transactionStatus: PaymentTransactionStatus | null;
  expiresAt: Date | string | null;
  paidAt: Date | string | null;
}

export interface CancelPendingPaymentResponse {
  appointmentId: string;
  appointmentStatus: AppointmentStatus.CANCELLED;
  paymentStatus: PaymentStatus;
}
