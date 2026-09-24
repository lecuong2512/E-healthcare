import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  AppointmentStatus,
  CounterPaymentMethod,
  PaymentMethod,
  PaymentStatus,
} from '@shared/enums';
import {
  ReceptionAppointmentViewModel,
} from '../../models/reception-presentation.models';
import { CheckinDeskPage } from './checkin-desk.page';

const appointment: ReceptionAppointmentViewModel = {
  id: 'appointment-1',
  appointmentCode: 'APT-260922-0001',
  status: AppointmentStatus.CONFIRMED,
  patientName: 'Nguyễn Văn An',
  patientPhone: '0912345678',
  doctorName: 'Trần Minh Bình',
  specialtyName: 'Tim mạch',
  roomNumber: 'P.201',
  date: '22/09/2026',
  startTime: '08:00',
  endTime: '08:30',
  paymentStatus: PaymentStatus.UNPAID,
  paymentMethod: PaymentMethod.PAY_AT_CLINIC,
  totalAmount: 350_000,
  queueNumber: null,
  requiresPayment: true,
  canCheckIn: false,
  blockedReason: 'Cần hoàn tất thanh toán.',
};

describe('CheckinDeskPage', () => {
  let fixture: ComponentFixture<CheckinDeskPage>;
  let component: CheckinDeskPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckinDeskPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CheckinDeskPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('renders the unified receptionist surface from the approved Figma frame', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(content).toContain(
      'Quầy lễ tân — Check-in & Đặt lịch trực tiếp',
    );
    expect(content).toContain('Quét mã QR Check-in');
    expect(content).toContain('Tiếp đón vãng lai (Walk-in Booking)');
    expect(content).toContain('SRS-REC-01 · SRS-REC-02');
  });

  it('emits a signed QR lookup without exposing the token in the DOM', () => {
    const lookupSpy = jasmine.createSpy('lookup');
    component.lookupRequested.subscribe(lookupSpy);

    component.handleQrScanned('signed-secret-token');
    fixture.detectChanges();

    expect(lookupSpy).toHaveBeenCalledOnceWith({
      kind: 'QR_TOKEN',
      value: 'signed-secret-token',
    });
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'signed-secret-token',
    );
  });

  it('validates a Vietnamese phone before emitting manual lookup', () => {
    const lookupSpy = jasmine.createSpy('lookup');
    component.lookupRequested.subscribe(lookupSpy);
    component.setManualLookupKind('PHONE');

    component.manualQuery.setValue('123');
    component.submitManualLookup();
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(component.manualQuery.hasError('phone')).toBeTrue();

    component.manualQuery.setValue('0912345678');
    component.submitManualLookup();
    expect(lookupSpy).toHaveBeenCalledWith({
      kind: 'PHONE',
      value: '0912345678',
    });
  });

  it('opens walk-in booking from the check-in desk', () => {
    const walkInSpy = jasmine.createSpy('walkInOpen');
    component.walkInOpenRequested.subscribe(walkInSpy);
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((item) => item.textContent?.includes('Walk-in Booking'))!;
    button.click();
    expect(walkInSpy).toHaveBeenCalledTimes(1);
  });

  it('calculates change and emits a counter payment intent once sufficient', () => {
    const paymentSpy = jasmine.createSpy('payment');
    component.paymentRequested.subscribe(paymentSpy);
    component.selectedAppointment = appointment;

    component.cashReceived.set(400_000);
    expect(component.changeAmount()).toBe(50_000);
    component.collectPayment();

    expect(paymentSpy).toHaveBeenCalledOnceWith({
      appointmentId: 'appointment-1',
      method: CounterPaymentMethod.CASH,
      amountTendered: 400_000,
    });
  });

  it('renders the backend receipt and requests printing without altering it', () => {
    const printSpy = jasmine.createSpy('printReceipt');
    component.receiptPrintRequested.subscribe(printSpy);
    fixture.componentRef.setInput('selectedAppointment', {
      ...appointment,
      paymentStatus: PaymentStatus.PAID,
      requiresPayment: false,
      canCheckIn: true,
      blockedReason: null,
    });
    fixture.componentRef.setInput('receipt', {
      receiptCode: 'RCT-260924-0001',
      transactionCode: 'TXN-260924-0001',
      appointmentCode: appointment.appointmentCode,
      patientName: appointment.patientName,
      doctorName: appointment.doctorName,
      amount: 350_000,
      amountTendered: 400_000,
      changeAmount: 50_000,
      paymentMethod: CounterPaymentMethod.CASH,
      collectedBy: 'receptionist-1',
      paidAt: '2026-09-24T02:00:00.000Z',
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('RCT-260924-0001');
    expect(host.textContent).toContain('TXN-260924-0001');
    const printButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('In phiếu thu'),
    ) as HTMLButtonElement;
    printButton.click();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('offers counter receipt reload only for pay-at-clinic appointments', () => {
    fixture.componentRef.setInput('selectedAppointment', {
      ...appointment,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.VNPAY,
      requiresPayment: false,
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('In/Tải lại phiếu thu');

    fixture.componentRef.setInput('selectedAppointment', {
      ...appointment,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.PAY_AT_CLINIC,
      requiresPayment: false,
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('In/Tải lại phiếu thu');
  });

  it('does not emit check-in while the authoritative view says it is blocked', () => {
    const checkInSpy = jasmine.createSpy('checkIn');
    component.checkInRequested.subscribe(checkInSpy);
    component.selectedAppointment = appointment;

    component.checkIn();

    expect(checkInSpy).not.toHaveBeenCalled();
  });

  it('renders the queue number for an appointment already checked in', () => {
    fixture.componentRef.setInput('selectedAppointment', {
      ...appointment,
      status: AppointmentStatus.CHECKED_IN,
      paymentStatus: PaymentStatus.PAID,
      queueNumber: 18,
      requiresPayment: false,
      canCheckIn: false,
      blockedReason: null,
    });
    fixture.detectChanges();

    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('đã check-in thành công');
    expect(content).toContain('18');
  });

  it('renders a non-PII realtime queue summary and requests reconciliation', () => {
    const refreshSpy = jasmine.createSpy('queueRefresh');
    component.queueRefreshRequested.subscribe(refreshSpy);
    fixture.componentRef.setInput('queueConnectionState', 'connected');
    fixture.componentRef.setInput('queueSummary', {
      waitingCount: 8,
      inConsultationCount: 3,
      updatedAtLabel: '08:30:10',
    });
    fixture.detectChanges();

    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Realtime đang hoạt động');
    expect(content).toContain('Đang chờ');

    const syncButton = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: HTMLButtonElement) =>
        button.textContent?.includes('Đồng bộ hàng đợi'),
    ) as HTMLButtonElement;
    syncButton.click();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});
