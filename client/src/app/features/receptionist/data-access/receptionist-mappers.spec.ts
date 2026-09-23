import {
  AppointmentStatus,
  CounterPaymentMethod,
  DateOfBirthPrecision,
  Gender,
  QueueSource,
} from '@shared/enums';
import {
  AvailableWalkInDoctor,
  QueueSnapshot,
  QueueStatusChanged,
  WalkInPatientSelectionError,
} from '@shared/interfaces';
import {
  mapPatientCandidates,
  mapQueueSnapshotToReceptionSummary,
  mapWalkInBookingIntent,
  mapWalkInDoctor,
  reconcileQueueSnapshot,
} from './receptionist-mappers';

describe('Reception mappers', () => {
  it('maps availableSlots once at the API boundary', () => {
    const doctor: AvailableWalkInDoctor = {
      doctorId: 'doctor-1',
      doctorName: 'Trần Minh Bình',
      specialtyName: 'Tim mạch',
      roomNumber: 'P.201',
      consultationFee: 350_000,
      availableSlots: [
        {
          scheduleId: 'schedule-1',
          startTime: '09:00',
          endTime: '09:30',
        },
      ],
    };

    const result = mapWalkInDoctor(doctor);

    expect(result.slots).toEqual(doctor.availableSlots);
  });

  it('maps walk-in intents to the canonical cash contract', () => {
    const result = mapWalkInBookingIntent({
      idempotencyKey: 'key-1',
      scheduleId: 'schedule-1',
      fullName: 'Nguyễn Văn An',
      phone: '0912345678',
      citizenId: '',
      birthYear: 1990,
      gender: Gender.MALE,
      reasonForVisit: 'Đau ngực',
      paymentMethod: CounterPaymentMethod.CASH,
      amountTendered: 400_000,
    });

    expect(result).toEqual({
      scheduleId: 'schedule-1',
      fullName: 'Nguyễn Văn An',
      phone: '0912345678',
      birthYear: 1990,
      gender: Gender.MALE,
      reasonForVisit: 'Đau ngực',
      paymentMethod: CounterPaymentMethod.CASH,
      amountTendered: 400_000,
    });
  });

  it('masks candidate names before rendering them', () => {
    const selection: WalkInPatientSelectionError = {
      code: 'PATIENT_SELECTION_REQUIRED',
      message: 'Chọn hồ sơ',
      candidates: [
        {
          patientId: 'patient-1',
          fullName: 'Nguyễn Văn An',
          gender: Gender.MALE,
          dateOfBirth: '1990-01-01',
          dateOfBirthPrecision: DateOfBirthPrecision.YEAR,
        },
      ],
    };

    expect(mapPatientCandidates(selection)[0]).toEqual(
      jasmine.objectContaining({
        maskedName: 'Nguyễn V. A.',
        birthDateLabel: '1990',
      }),
    );
  });

  it('reconciles status events and derives a non-PII queue summary', () => {
    const initial: QueueSnapshot = {
      scope: 'RECEPTION',
      date: '2026-09-24',
      items: [],
    };
    const event: QueueStatusChanged = {
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
    };

    const snapshot = reconcileQueueSnapshot(initial, event);
    const summary = mapQueueSnapshotToReceptionSummary(
      snapshot,
      new Date('2026-09-24T01:00:00.000Z'),
    );

    expect(summary.waitingCount).toBe(1);
    expect(summary.inConsultationCount).toBe(0);
    expect(summary.lastIssuedQueueNumber).toBe(12);
    expect(summary).not.toEqual(
      jasmine.objectContaining({ patientName: jasmine.anything() }),
    );
  });
});
