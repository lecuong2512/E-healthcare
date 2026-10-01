import { AppointmentStatus, CounterPaymentMethod, PaymentStatus } from '@shared/enums';
import { ClinicPrintInfo, CounterPaymentReceipt } from '@shared/interfaces';
import { ReceptionAppointmentViewModel } from '../models/reception-presentation.models';
import { CheckinTicketPrintData, PaymentReceiptPrintData } from '../models/reception-print.model';

export function mapCheckinTicketPrintData(
  appointment: ReceptionAppointmentViewModel,
  clinic: ClinicPrintInfo,
  receipt?: CounterPaymentReceipt,
): CheckinTicketPrintData {
  if (receipt && receipt.appointmentCode !== appointment.appointmentCode) {
    throw new Error('Phiếu thu không khớp lịch hẹn.');
  }
  const { queueNumber, checkedInAt } = appointment;
  if (appointment.status !== AppointmentStatus.CHECKED_IN || !queueNumber ||
      !Number.isInteger(queueNumber) || queueNumber < 1 || !checkedInAt) {
    throw new Error('Lịch hẹn chưa có thông tin check-in hợp lệ để in.');
  }
  return {
    type: 'CHECKIN_TICKET', appointmentId: appointment.id,
    appointmentCode: appointment.appointmentCode, patientName: appointment.patientName,
    queueNumber, doctorName: appointment.doctorName, specialtyName: appointment.specialtyName,
    roomNumber: appointment.roomNumber, appointmentDate: appointment.date,
    appointmentTime: appointment.startTime,
    paidAmount: receipt?.amount ?? (appointment.paymentStatus === PaymentStatus.PAID
      ? appointment.totalAmount : undefined),
    qrValue: appointment.appointmentCode, checkedInAt, clinic: { ...clinic },
  };
}

export function mapPaymentReceiptPrintData(
  receipt: CounterPaymentReceipt,
  clinic: ClinicPrintInfo,
  appointment?: ReceptionAppointmentViewModel,
): PaymentReceiptPrintData {
  if (appointment && appointment.appointmentCode !== receipt.appointmentCode) {
    throw new Error('Phiếu thu không khớp lịch hẹn.');
  }
  return {
    ...receipt, type: 'PAYMENT_RECEIPT', specialtyName: appointment?.specialtyName,
    description: 'Thu viện phí khám bệnh',
    paymentMethod: receipt.paymentMethod === CounterPaymentMethod.CASH
      ? 'Tiền mặt' : receipt.paymentMethod,
    clinic: { ...clinic },
  };
}
