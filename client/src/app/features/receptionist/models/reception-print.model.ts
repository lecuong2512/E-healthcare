import { ClinicPrintInfo } from '@shared/interfaces';

export type PrintReceiptType = 'CHECKIN_TICKET' | 'PAYMENT_RECEIPT';

export interface CheckinTicketPrintData {
  type: 'CHECKIN_TICKET';
  appointmentId: string;
  appointmentCode: string;
  patientName: string;
  queueNumber: number;
  doctorName: string;
  specialtyName: string;
  roomNumber: string;
  appointmentDate: string;
  appointmentTime: string;
  paidAmount?: number;
  qrValue?: string;
  checkedInAt: string;
  clinic: ClinicPrintInfo;
}

export interface PaymentReceiptPrintData {
  type: 'PAYMENT_RECEIPT';
  receiptCode: string;
  transactionCode: string;
  appointmentCode: string;
  patientName: string;
  doctorName: string;
  specialtyName?: string;
  description: string;
  amount: number;
  amountTendered: number;
  changeAmount: number;
  paymentMethod: string;
  collectedBy: string;
  paidAt: string;
  clinic: ClinicPrintInfo;
}

export type PrintReceiptData = CheckinTicketPrintData | PaymentReceiptPrintData;
