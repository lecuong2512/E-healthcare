import { AppointmentStatus, CounterPaymentMethod, PaymentMethod, PaymentStatus, QueueSource } from '@shared/enums';
import { CheckInResponse, ClinicPrintInfo, CounterPaymentReceipt, ReceptionAppointment } from '@shared/interfaces';

// Synthetic data exclusively for tests and print preview QA.
export const CLINIC: ClinicPrintInfo = {
  clinicName: 'Phòng khám kiểm thử', address: 'Địa chỉ dùng cho kiểm thử',
  phone: '02800000000', taxCode: 'TEST-TAX', licenseNumber: 'TEST-LICENSE',
};
export const APPOINTMENT: ReceptionAppointment = {
  id: '11111111-1111-4111-8111-111111111111', appointmentCode: 'APT-260922-0001',
  status: AppointmentStatus.CONFIRMED, patientId: 'test-patient', patientName: 'Nguyễn Thị Ánh',
  patientPhone: null, doctorId: 'test-doctor', doctorName: 'Trần Minh', specialtyName: 'Nội tổng quát',
  roomNumber: 'P101', date: '2026-09-22', startTime: '09:00:00', endTime: '09:30:00',
  paymentStatus: PaymentStatus.PAID, paymentMethod: PaymentMethod.PAY_AT_CLINIC,
  totalAmount: 150000, queueNumber: null, checkedInAt: null,
  requiresPayment: false, canCheckIn: true, blockedReason: null,
};
export const CHECK_IN: CheckInResponse = {
  appointmentId: APPOINTMENT.id, appointmentCode: APPOINTMENT.appointmentCode,
  status: AppointmentStatus.CHECKED_IN, queueNumber: 99, queueDate: APPOINTMENT.date,
  queueSource: QueueSource.APPOINTMENT, doctorId: APPOINTMENT.doctorId,
  doctorName: APPOINTMENT.doctorName, roomNumber: APPOINTMENT.roomNumber,
  patientName: APPOINTMENT.patientName, checkedInAt: '2026-09-22T01:45:00.000Z',
};
export const RECEIPT: CounterPaymentReceipt = {
  receiptCode: 'REC-TEST-001', transactionCode: 'TXN-TEST-001', appointmentCode: APPOINTMENT.appointmentCode,
  patientName: APPOINTMENT.patientName, doctorName: APPOINTMENT.doctorName,
  amount: 150000, amountTendered: 200000, changeAmount: 50000,
  paymentMethod: CounterPaymentMethod.CASH, collectedBy: 'Lễ tân kiểm thử', paidAt: '2026-09-22T01:40:00.000Z',
};
