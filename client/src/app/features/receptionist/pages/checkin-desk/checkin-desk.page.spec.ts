import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppointmentStatus, PaymentStatus } from '@shared/enums';
import { ReceptionAppointmentViewModel } from '../../models/reception-presentation.models';
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

  it('calculates change and emits a counter payment intent once sufficient', () => {
    const paymentSpy = jasmine.createSpy('payment');
    component.paymentRequested.subscribe(paymentSpy);
    component.selectedAppointment = appointment;

    component.cashReceived.set(400_000);
    expect(component.changeAmount()).toBe(50_000);
    component.collectPayment();

    expect(paymentSpy).toHaveBeenCalledOnceWith({
      appointmentId: 'appointment-1',
      amountTendered: 400_000,
    });
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
});
