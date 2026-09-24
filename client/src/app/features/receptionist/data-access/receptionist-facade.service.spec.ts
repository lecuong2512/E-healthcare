import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Socket } from 'socket.io-client';

import {
  AppointmentStatus,
  CounterPaymentMethod,
  DateOfBirthPrecision,
  Gender,
  PaymentMethod,
  PaymentStatus,
  QueueSource,
} from '@shared/enums';
import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_SNAPSHOT_EVENT,
  QUEUE_SYNC_EVENT,
} from '@shared/constants/queue-socket.constants';
import { SocketService } from '../../../core/services/socket.service';
import { ReceptionistApiService } from './receptionist-api.service';
import { ReceptionistFacade } from './receptionist-facade.service';

class FakeQueueSocket {
  connected = true;
  private readonly listeners = new Map<string, Set<(payload: any) => void>>();
  readonly emitted: Array<{ event: string; payload?: unknown }> = [];

  on(event: string, listener: (payload: any) => void): this {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: (payload: any) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload?: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  serverEmit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

describe('ReceptionistFacade', () => {
  let facade: ReceptionistFacade;
  let api: jasmine.SpyObj<ReceptionistApiService>;
  let socket: FakeQueueSocket;
  let socketService: {
    connectionStates: ReturnType<typeof signal<Record<string, any>>>;
    connect: jasmine.Spy;
    disconnect: jasmine.Spy;
  };

  beforeEach(() => {
    socket = new FakeQueueSocket();
    api = jasmine.createSpyObj<ReceptionistApiService>(
      'ReceptionistApiService',
      [
        'lookupAppointments',
        'lookupQr',
        'checkInByQr',
        'checkIn',
        'collectPayment',
        'getReceipt',
        'getWalkInDoctors',
        'createWalkIn',
        'getQueue',
      ],
    );
    api.lookupAppointments.and.returnValue(of([]));
    api.getWalkInDoctors.and.returnValue(of([]));
    api.getQueue.and.returnValue(
      of({ scope: 'RECEPTION', date: '2026-09-24', items: [] }),
    );

    socketService = {
      connectionStates: signal<Record<string, any>>({
        '/queue': 'connected',
      }),
      connect: jasmine
        .createSpy('connect')
        .and.returnValue(socket as unknown as Socket),
      disconnect: jasmine.createSpy('disconnect'),
    };

    TestBed.configureTestingModule({
      providers: [
        ReceptionistFacade,
        { provide: ReceptionistApiService, useValue: api },
        { provide: SocketService, useValue: socketService },
      ],
    });

    facade = TestBed.inject(ReceptionistFacade);
    TestBed.flushEffects();
  });

  it('maps a phone lookup response into selected presentation state', () => {
    api.lookupAppointments.and.returnValue(
      of([
        {
          id: 'appointment-1',
          appointmentCode: 'APT-260924-0001',
          status: AppointmentStatus.CONFIRMED,
          patientId: 'patient-1',
          patientName: 'Nguyễn Văn An',
          patientPhone: '0912345678',
          doctorId: 'doctor-1',
          doctorName: 'Trần Minh Bình',
          specialtyName: 'Tim mạch',
          roomNumber: 'P.201',
          date: '2026-09-24',
          startTime: '09:00',
          endTime: '09:30',
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.PAY_AT_CLINIC,
          totalAmount: 350_000,
          queueNumber: null,
          checkedInAt: null,
          requiresPayment: false,
          canCheckIn: true,
          blockedReason: null,
        },
      ]),
    );

    facade.lookup({ kind: 'PHONE', value: '0912345678' });

    expect(api.lookupAppointments).toHaveBeenCalledOnceWith({
      phone: '0912345678',
    });
    expect(facade.selectedAppointment()?.id).toBe('appointment-1');
    expect(facade.loading()).toBeFalse();
  });

  it('retains the authoritative payment receipt after refreshing the appointment', () => {
    const paidAppointment = {
      id: 'appointment-1',
      appointmentCode: 'APT-260924-0001',
      status: AppointmentStatus.CONFIRMED,
      patientId: 'patient-1',
      patientName: 'Nguyễn Văn An',
      patientPhone: '0912345678',
      doctorId: 'doctor-1',
      doctorName: 'Trần Minh Bình',
      specialtyName: 'Tim mạch',
      roomNumber: 'P.201',
      date: '2026-09-24',
      startTime: '09:00',
      endTime: '09:30',
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.PAY_AT_CLINIC,
      totalAmount: 350_000,
      queueNumber: null,
      checkedInAt: null,
      requiresPayment: false,
      canCheckIn: true,
      blockedReason: null,
    };
    const receipt = {
      receiptCode: 'RCT-260924-0001',
      transactionCode: 'TXN-260924-0001',
      appointmentCode: paidAppointment.appointmentCode,
      patientName: paidAppointment.patientName,
      doctorName: paidAppointment.doctorName,
      amount: 350_000,
      amountTendered: 400_000,
      changeAmount: 50_000,
      paymentMethod: CounterPaymentMethod.CASH,
      collectedBy: 'receptionist-1',
      paidAt: '2026-09-24T02:00:00.000Z',
    };

    api.lookupAppointments.and.returnValues(
      of([
        {
          ...paidAppointment,
          paymentStatus: PaymentStatus.UNPAID,
          requiresPayment: true,
          canCheckIn: false,
        },
      ]),
      of([paidAppointment]),
    );
    api.collectPayment.and.returnValue(of(receipt));

    facade.lookup({
      kind: 'APPOINTMENT_CODE',
      value: paidAppointment.appointmentCode,
    });
    facade.collectPayment({
      appointmentId: paidAppointment.id,
      method: CounterPaymentMethod.CASH,
      amountTendered: 400_000,
    });

    expect(facade.lastReceipt()).toEqual(receipt);
    expect(facade.selectedAppointment()?.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('keeps a committed receipt when the appointment refresh fails and prevents a second charge', () => {
    const appointment = {
      id: 'appointment-1', appointmentCode: 'APT-1', status: AppointmentStatus.CONFIRMED,
      patientId: 'patient-1', patientName: 'An', patientPhone: '0912345678',
      doctorId: 'doctor-1', doctorName: 'Binh', specialtyName: 'Tim mach', roomNumber: '201',
      date: '2026-09-24', startTime: '09:00', endTime: '09:30',
      paymentStatus: PaymentStatus.UNPAID, paymentMethod: PaymentMethod.PAY_AT_CLINIC,
      totalAmount: 350_000, queueNumber: null, checkedInAt: null,
      requiresPayment: true, canCheckIn: false, blockedReason: 'Chua thanh toan',
    };
    const receipt = {
      receiptCode: 'RCT-1', transactionCode: 'TXN-1', appointmentCode: 'APT-1',
      patientName: 'An', doctorName: 'Binh', amount: 350_000, amountTendered: 350_000,
      changeAmount: 0, paymentMethod: CounterPaymentMethod.CASH,
      collectedBy: 'receptionist-1', paidAt: '2026-09-24T02:00:00.000Z',
    };
    api.lookupAppointments.and.returnValues(of([appointment]), throwError(() => new HttpErrorResponse({ status: 503 })));
    api.collectPayment.and.returnValue(of(receipt));
    facade.lookup({ kind: 'APPOINTMENT_CODE', value: 'APT-1' });
    const intent = { appointmentId: 'appointment-1', method: CounterPaymentMethod.CASH, amountTendered: 350_000 };
    facade.collectPayment(intent);
    expect(facade.lastReceipt()).toEqual(receipt);
    expect(facade.checkInError()).toContain('Đã thu tiền');
    facade.collectPayment(intent);
    expect(api.collectPayment).toHaveBeenCalledTimes(1);
  });

  it('maps PATIENT_SELECTION_REQUIRED without treating it as slot conflict', () => {
    api.createWalkIn.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              code: 'PATIENT_SELECTION_REQUIRED',
              message: 'Chọn hồ sơ phù hợp',
              candidates: [
                {
                  patientId: 'patient-1',
                  fullName: 'Nguyễn Văn An',
                  gender: Gender.MALE,
                  dateOfBirth: '1990-01-01',
                  dateOfBirthPrecision: DateOfBirthPrecision.YEAR,
                },
              ],
            },
          }),
      ),
    );

    facade.createWalkIn({
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      scheduleId: '11111111-1111-4111-8111-111111111111',
      fullName: 'Nguyễn Văn An',
      phone: '0912345678',
      citizenId: '',
      birthYear: 1990,
      gender: Gender.MALE,
      reasonForVisit: 'Đau ngực',
      paymentMethod: CounterPaymentMethod.CASH,
      amountTendered: 400_000,
    });

    expect(facade.walkInCandidates()[0].maskedName).toBe('Nguyễn V. A.');
    expect(facade.walkInSlotConflict()).toBeFalse();
  });

  it('reconciles queue events and cleans up its socket listener', () => {
    const release = facade.connectQueue();

    socket.serverEmit(QUEUE_SNAPSHOT_EVENT, {
      scope: 'RECEPTION',
      date: '2026-09-24',
      items: [],
    });
    socket.serverEmit(APPOINTMENT_STATUS_CHANGED_EVENT, {
      appointmentId: 'appointment-1',
      appointmentCode: 'APT-260924-0001',
      doctorId: 'doctor-1',
      previousStatus: AppointmentStatus.CONFIRMED,
      status: AppointmentStatus.CHECKED_IN,
      queueNumber: 12,
      source: 'RECEPTION_CHECKIN',
      occurredAt: '2026-09-24T01:00:00.000Z',
      ticket: {
        appointmentId: 'appointment-1',
        appointmentCode: 'APT-260924-0001',
        patientName: 'Nguyễn Văn An',
        doctorId: 'doctor-1',
        doctorName: 'Trần Minh Bình',
        roomNumber: 'P.201',
        status: AppointmentStatus.CHECKED_IN,
        queueNumber: 12,
        queueDate: '2026-09-24',
        queueSource: QueueSource.APPOINTMENT,
        checkedInAt: '2026-09-24T01:00:00.000Z',
      },
    });

    expect(facade.queueSummary()?.waitingCount).toBe(1);
    expect(
      socket.emitted.some((event) => event.event === QUEUE_SYNC_EVENT),
    ).toBeTrue();

    release();
    expect(socketService.disconnect).toHaveBeenCalledOnceWith('/queue');
  });
});
