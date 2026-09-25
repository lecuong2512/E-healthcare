import { AppointmentStatus, PaymentStatus } from '@shared/enums';
import { mapCheckInResult, mapReceptionAppointment } from '../data-access/receptionist-mappers';
import { APPOINTMENT, CHECK_IN, CLINIC, RECEIPT } from '../testing/reception-print.fixtures';
import { mapCheckinTicketPrintData, mapPaymentReceiptPrintData } from './reception-print.mapper';

describe('Reception print mapping', () => {
  const appointment = mapReceptionAppointment(APPOINTMENT);
  const checkedIn = mapCheckInResult(appointment, CHECK_IN);

  it('prints authoritative check-in state and an appointment-code QR', () => {
    const data = mapCheckinTicketPrintData(checkedIn, CLINIC);
    expect(data).toEqual(jasmine.objectContaining({
      type: 'CHECKIN_TICKET', queueNumber: 99, checkedInAt: CHECK_IN.checkedInAt,
      specialtyName: appointment.specialtyName, appointmentTime: appointment.startTime,
      qrValue: appointment.appointmentCode, paidAmount: 150000,
    }));
    expect(data.clinic).not.toBe(CLINIC);
  });

  it('reprints a checked-in appointment without another POST', () => {
    expect(mapCheckinTicketPrintData({ ...checkedIn, queueNumber: 1000 }, CLINIC).queueNumber).toBe(1000);
  });

  it('rejects missing check-in data and mismatched receipts', () => {
    expect(() => mapCheckinTicketPrintData(appointment, CLINIC)).toThrow();
    expect(() => mapCheckinTicketPrintData({ ...checkedIn, checkedInAt: null }, CLINIC)).toThrow();
    expect(() => mapCheckinTicketPrintData({ ...checkedIn, status: AppointmentStatus.COMPLETED }, CLINIC)).toThrow();
    expect(() => mapCheckinTicketPrintData(checkedIn, CLINIC, { ...RECEIPT, appointmentCode: 'other' })).toThrow();
    expect(() => mapPaymentReceiptPrintData({ ...RECEIPT, appointmentCode: 'other' }, CLINIC, appointment)).toThrow();
  });

  for (const queueNumber of [0, -1, 1.5]) {
    it(`rejects invalid queue number ${queueNumber}`, () => {
      expect(() => mapCheckinTicketPrintData({ ...checkedIn, queueNumber }, CLINIC)).toThrow();
    });
  }

  it('preserves money and cashier audit fields', () => {
    const receipt = { ...RECEIPT, amount: 0 };
    expect(mapCheckinTicketPrintData(checkedIn, CLINIC, receipt).paidAmount).toBe(0);
    expect(mapCheckinTicketPrintData({ ...checkedIn, paymentStatus: PaymentStatus.UNPAID }, CLINIC).paidAmount).toBeUndefined();
    expect(mapPaymentReceiptPrintData(receipt, CLINIC, appointment)).toEqual(jasmine.objectContaining({
      amount: 0, paymentMethod: 'Tiền mặt', receiptCode: receipt.receiptCode,
      transactionCode: receipt.transactionCode, collectedBy: receipt.collectedBy,
      paidAt: receipt.paidAt,
    }));
  });
});
