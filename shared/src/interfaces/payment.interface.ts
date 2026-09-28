import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '../enums';

export interface InitiatePaymentRequest {
  provider: PaymentMethod.VNPAY | PaymentMethod.MOMO;
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
  appointmentStatus: AppointmentStatus;
  paymentStatus: PaymentStatus;
  provider: PaymentMethod;
  transactionStatus: PaymentTransactionStatus | null;
  expiresAt: Date | string | null;
  paidAt: Date | string | null;
}
