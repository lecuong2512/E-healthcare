import './test-environment';
import { UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { environment } from '../src/config/environment';
import { QueueBoardTokenService } from '../src/modules/realtime/queue-board-token.service';
import { toPublicQueueTicket } from '../src/modules/realtime/public-queue.mapper';
import { AppointmentStatus, QueueSource } from '@shared/enums';
import { QueueTicket } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { SessionService } from '../src/modules/auth/session.service';

describe('Public queue board', () => {
  const tokens = new QueueBoardTokenService();

  it('issues a purpose-bound token that expires after one shift', async () => {
    const { token, expiresAt } = tokens.issue();
    expect(tokens.verify(token)).toMatchObject({ tokenId: expect.any(String) });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const accessToken = sign({ type: 'access' }, environment.JWT_ACCESS_SECRET!, {
      algorithm: 'HS256', issuer: 'ehealth-api', audience: 'ehealth-client', expiresIn: 900,
    });
    expect(() => tokens.verify(accessToken)).toThrow(UnauthorizedException);
    expect(() => tokens.verify(`${token.slice(0, -4)}abcd`)).toThrow(UnauthorizedException);
    const sessions = new SessionService({} as DataSource);
    await expect(sessions.authenticate(token)).rejects.toMatchObject({
      response: { code: 'SESSION_INVALID' },
    });
  });

  it('rejects expired board tokens', () => {
    const { token } = tokens.issue();
    jest.useFakeTimers();
    try {
      jest.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
      expect(() => tokens.verify(token)).toThrow(UnauthorizedException);
    } finally {
      jest.useRealTimers();
    }
  });

  it('whitelists only display fields and masks patient names', () => {
    const ticket = {
      appointmentId: 'private-id', appointmentCode: 'APT-PRIVATE',
      patientName: 'Nguyễn Văn A', patientPhone: '0912345678', citizenId: '012345678901',
      doctorId: 'doctor-id', doctorName: 'Bác sĩ A', specialtyName: 'Tim mạch',
      roomNumber: 'P1',
      status: AppointmentStatus.CHECKED_IN, queueNumber: 12,
      queueDate: '2026-09-22', queueSource: QueueSource.APPOINTMENT,
      checkedInAt: '2026-09-22T02:00:00.000Z',
    } as QueueTicket & { patientPhone: string; citizenId: string };

    const publicTicket = toPublicQueueTicket(ticket);
    expect(publicTicket).toEqual({
      doctorId: 'doctor-id', doctorName: 'Bác sĩ A', specialtyName: 'Tim mạch',
      roomNumber: 'P1', maskedPatientName: 'Nguyễn V. A.',
      status: AppointmentStatus.CHECKED_IN,
      queueNumber: 12, queueDate: '2026-09-22',
    });
    const serialized = JSON.stringify(publicTicket);
    for (const privateValue of [ticket.patientName, ticket.patientPhone, ticket.citizenId,
      ticket.appointmentId, ticket.appointmentCode]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});
