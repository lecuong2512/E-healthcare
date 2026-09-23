import './test-environment';
import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { sign } from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { environment } from '../src/config/environment';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { CheckInQrService } from '../src/modules/reception/check-in-qr.service';
import { ReceptionService } from '../src/modules/reception/reception.service';

describe('CheckInQrService', () => {
  const appointmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const appointmentCode = 'APT-260922-1234';
  const context = { actorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ip: null, userAgent: null };
  const appointment = {
    id: appointmentId, patientId, appointmentCode, status: AppointmentStatus.CONFIRMED,
  } as AppointmentEntity;
  const findOneBy = jest.fn();
  const lookup = jest.fn();
  const checkIn = jest.fn();
  let service: CheckInQrService;

  beforeEach(() => {
    jest.clearAllMocks();
    findOneBy.mockResolvedValue(appointment);
    lookup.mockResolvedValue([{ id: appointmentId, appointmentCode }]);
    checkIn.mockResolvedValue({ appointmentId, status: AppointmentStatus.CHECKED_IN });
    service = new CheckInQrService(
      { getRepository: jest.fn(() => ({ findOneBy })) } as unknown as DataSource,
      { lookup, checkIn } as unknown as ReceptionService,
    );
  });

  it('issues an expiring QR only for the owning patient and resolves the signed appointment', async () => {
    const issued = await service.issue(appointmentId, patientId);
    expect(findOneBy).toHaveBeenCalledWith({ id: appointmentId, patientId });
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(await service.lookup(issued.qrToken, context)).toMatchObject({ id: appointmentId });
    expect(lookup).toHaveBeenCalledWith({ code: appointmentCode }, context);
    expect(await service.checkIn(issued.qrToken, context)).toMatchObject({ appointmentId });
    expect(checkIn).toHaveBeenCalledWith(appointmentId, context);
  });

  it('does not issue a QR for another patient or a completed appointment', async () => {
    findOneBy.mockResolvedValueOnce(null);
    await expect(service.issue(appointmentId, 'other-patient')).rejects.toThrow(NotFoundException);
    findOneBy.mockResolvedValueOnce({ ...appointment, status: AppointmentStatus.CHECKED_IN });
    await expect(service.issue(appointmentId, patientId)).rejects.toThrow(ConflictException);
  });

  it('rejects tampered and wrong-purpose QR tokens before accessing the appointment', async () => {
    const { qrToken } = await service.issue(appointmentId, patientId);
    const parts = qrToken.split('.');
    parts[1] = `${parts[1][0] === 'A' ? 'B' : 'A'}${parts[1].slice(1)}`;
    await expect(service.checkIn(parts.join('.'), context)).rejects.toThrow(BadRequestException);
    const wrongPurpose = sign({ type: 'access', appointmentCode }, environment.QR_CHECKIN_SECRET!, {
      algorithm: 'HS256', issuer: 'ehealth-api', audience: 'ehealth-reception-check-in',
      subject: appointmentId, jwtid: 'wrong-purpose', expiresIn: 900,
    });
    await expect(service.checkIn(wrongPurpose, context)).rejects.toThrow(BadRequestException);
    expect(checkIn).not.toHaveBeenCalled();
  });

  it('rejects an expired QR before check-in', async () => {
    const { qrToken } = await service.issue(appointmentId, patientId);
    jest.useFakeTimers();
    try {
      jest.setSystemTime(Date.now() + 16 * 60 * 1000);
      await expect(service.checkIn(qrToken, context)).rejects.toThrow(GoneException);
      expect(checkIn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
