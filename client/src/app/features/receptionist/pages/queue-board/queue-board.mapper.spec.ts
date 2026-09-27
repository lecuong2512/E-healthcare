import { AppointmentStatus } from '@shared/enums';
import { PublicQueueTicket } from '@shared/interfaces';

import {
  mapPublicQueueSnapshot,
  mapPublicQueueStatusChanged,
} from './queue-board.mapper';

const checkedIn: PublicQueueTicket = {
  doctorId: 'doctor-1',
  doctorName: 'Trần Minh An',
  specialtyName: 'Tim mạch',
  roomNumber: 'P.201',
  maskedPatientName: 'Nguyễn V. A.',
  status: AppointmentStatus.CHECKED_IN,
  queueNumber: 12,
  queueDate: '2026-09-24',
};

describe('Queue Board public mapper', () => {
  it('separates checked-in and in-consultation tickets', () => {
    const snapshot = mapPublicQueueSnapshot({
      scope: 'PUBLIC',
      date: '2026-09-24',
      items: [
        checkedIn,
        {
          ...checkedIn,
          queueNumber: 11,
          status: AppointmentStatus.IN_CONSULTATION,
        },
      ],
    });

    expect(snapshot.nextUp.map((ticket) => ticket.queueNumber)).toEqual([12]);
    expect(snapshot.nowServing.map((ticket) => ticket.queueNumber)).toEqual([11]);
    expect(snapshot.nextUp[0]).toEqual(jasmine.objectContaining({
      id: 'doctor-1:2026-09-24:12',
      specialtyName: 'Tim mạch',
    }));
  });

  it('maps the redacted public event without private identifiers', () => {
    const event = mapPublicQueueStatusChanged({
      doctorId: checkedIn.doctorId,
      queueNumber: checkedIn.queueNumber,
      previousStatus: null,
      status: AppointmentStatus.CHECKED_IN,
      occurredAt: '2026-09-24T03:00:00.000Z',
      ticket: checkedIn,
    });

    expect(event?.ticket.maskedPatientName).toBe('Nguyễn V. A.');
    expect(event?.status).toBe('CHECKED_IN');
  });

  it('ignores status values outside the public board lifecycle', () => {
    expect(mapPublicQueueStatusChanged({
      doctorId: checkedIn.doctorId,
      queueNumber: checkedIn.queueNumber,
      previousStatus: null,
      status: AppointmentStatus.CANCELLED,
      occurredAt: '2026-09-24T03:00:00.000Z',
      ticket: { ...checkedIn, status: AppointmentStatus.CANCELLED },
    })).toBeNull();
  });
});
