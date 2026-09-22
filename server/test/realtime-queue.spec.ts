import './test-environment';
import { UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { Role, AppointmentStatus, QueueSource } from '@shared/enums';
import { QueueTicket } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { Socket } from 'socket.io';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { SessionService } from '../src/modules/auth/session.service';
import { environment } from '../src/config/environment';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { QueueGateway } from '../src/modules/realtime/queue.gateway';
import { QueueQueryService } from '../src/modules/realtime/queue-query.service';
import { QueueBoardTokenService } from '../src/modules/realtime/queue-board-token.service';
import { toPublicQueueTicket } from '../src/modules/realtime/public-queue.mapper';
import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_AUTH_EXPIRED_EVENT,
  QUEUE_DOCTOR_ROOM,
  QUEUE_RECEPTION_ROOM,
  QUEUE_PUBLIC_ROOM,
  QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
  QUEUE_SNAPSHOT_EVENT,
} from '../../shared/src/constants/queue-socket.constants';

describe('Realtime queue', () => {
  const doctorId = 'doctor-1';
  const userId = 'user-1';
  const token = sign({ exp: Math.floor(Date.now() / 1000) + 60 }, 'test');
  const ticket: QueueTicket = {
    appointmentId: 'appointment-1',
    appointmentCode: 'APT-1',
    patientName: 'Patient',
    doctorId,
    doctorName: 'Doctor',
    roomNumber: 'P1',
    status: AppointmentStatus.CHECKED_IN,
    queueNumber: 2,
    queueDate: '2026-09-21',
    queueSource: QueueSource.WALK_IN,
    checkedInAt: '2026-09-21T02:00:00.000Z',
  };
  const sessions = { authenticate: jest.fn() };
  const queries = { snapshot: jest.fn(), publicSnapshot: jest.fn(), ticket: jest.fn() };
  const boardTokens = { verify: jest.fn() };
  const doctorRepository = { findOneBy: jest.fn() };
  const database = { getRepository: jest.fn() };
  let gateway: QueueGateway;

  function client(authToken: unknown = token, id = 'socket-1', boardToken?: unknown) {
    return {
      id,
      handshake: { auth: { token: authToken, boardToken }, address: '127.0.0.1' },
      data: {},
      join: jest.fn(async () => undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessions.authenticate.mockResolvedValue({ role: Role.DOCTOR, userId });
    doctorRepository.findOneBy.mockResolvedValue({ id: doctorId });
    database.getRepository.mockReturnValue(doctorRepository);
    queries.snapshot.mockResolvedValue({ scope: 'DOCTOR', doctorId, date: ticket.queueDate, items: [ticket] });
    queries.publicSnapshot.mockResolvedValue({
      scope: 'PUBLIC', date: ticket.queueDate, items: [toPublicQueueTicket(ticket)],
    });
    queries.ticket.mockResolvedValue(ticket);
    boardTokens.verify.mockReturnValue({ tokenId: 'board-1', expiresAt: Date.now() + 60_000 });
    gateway = new QueueGateway(
      sessions as unknown as SessionService,
      database as unknown as DataSource,
      queries as unknown as QueueQueryService,
      boardTokens as unknown as QueueBoardTokenService,
    );
  });

  it('derives the doctor room from the authenticated account and sends a scoped snapshot', async () => {
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    expect(database.getRepository).toHaveBeenCalledWith(DoctorEntity);
    expect(doctorRepository.findOneBy).toHaveBeenCalledWith({ userId });
    expect(socket.join).toHaveBeenCalledWith(QUEUE_DOCTOR_ROOM(doctorId));
    expect(queries.snapshot).toHaveBeenCalledWith('DOCTOR', doctorId);
    expect(socket.emit).toHaveBeenCalledWith(QUEUE_SNAPSHOT_EVENT, expect.objectContaining({ doctorId }));
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('rejects patient sockets before joining a queue room', async () => {
    sessions.authenticate.mockResolvedValue({ role: Role.PATIENT, userId });
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(queries.snapshot).not.toHaveBeenCalled();
  });

  it('rejects a doctor account without a doctor record', async () => {
    doctorRepository.findOneBy.mockResolvedValue(null);
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('sends reception snapshot without doctor scope', async () => {
    sessions.authenticate.mockResolvedValue({ role: Role.RECEPTIONIST, userId });
    queries.snapshot.mockResolvedValue({ scope: 'RECEPTION', date: ticket.queueDate, items: [ticket] });
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.join).toHaveBeenCalledWith(QUEUE_RECEPTION_ROOM);
    expect(queries.snapshot).toHaveBeenCalledWith('RECEPTION', undefined);
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('disconnects a revoked session on sync', async () => {
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    sessions.authenticate.mockRejectedValue(new Error('revoked'));
    await gateway.sync(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.emit).not.toHaveBeenCalledWith(QUEUE_AUTH_EXPIRED_EVENT);
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('signals token expiry before disconnecting a connected socket', async () => {
    jest.useFakeTimers();
    try {
      const socket = client();
      await gateway.handleConnection(socket as unknown as Socket);
      jest.advanceTimersByTime(61_000);
      expect(socket.emit).toHaveBeenCalledWith(QUEUE_AUTH_EXPIRED_EVENT);
      expect(socket.emit.mock.invocationCallOrder.at(-1)).toBeLessThan(
        socket.disconnect.mock.invocationCallOrder[0],
      );
      gateway.handleDisconnect(socket as unknown as Socket);
    } finally {
      jest.useRealTimers();
    }
  });

  it('signals an expired session on sync', async () => {
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    sessions.authenticate.mockRejectedValue(new UnauthorizedException({ code: 'SESSION_EXPIRED' }));
    await gateway.sync(socket as unknown as Socket);
    expect(socket.emit).toHaveBeenCalledWith(QUEUE_AUTH_EXPIRED_EVENT);
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('distinguishes an expired token from an invalid token during connection', async () => {
    const expired = client();
    sessions.authenticate.mockRejectedValueOnce(
      new UnauthorizedException({ code: 'SESSION_EXPIRED' }),
    );
    await gateway.handleConnection(expired as unknown as Socket);
    expect(expired.emit).toHaveBeenCalledWith(QUEUE_AUTH_EXPIRED_EVENT);
    expect(expired.disconnect).toHaveBeenCalledWith(true);

    const invalid = client();
    sessions.authenticate.mockRejectedValueOnce(
      new UnauthorizedException({ code: 'SESSION_INVALID' }),
    );
    await gateway.handleConnection(invalid as unknown as Socket);
    expect(invalid.emit).not.toHaveBeenCalledWith(QUEUE_AUTH_EXPIRED_EVENT);
    expect(invalid.disconnect).toHaveBeenCalledWith(true);
  });

  it('classifies only a verified expired access token as expired', async () => {
    const realSessions = new SessionService(database as unknown as DataSource);
    const expired = sign({ type: 'access' }, environment.JWT_ACCESS_SECRET!, {
      algorithm: 'HS256', issuer: 'ehealth-api', audience: 'ehealth-client', expiresIn: -1,
    });
    await expect(realSessions.authenticate(expired)).rejects.toMatchObject({
      response: { code: 'SESSION_EXPIRED' },
    });
    await expect(realSessions.authenticate('invalid.token.value')).rejects.toMatchObject({
      response: { code: 'SESSION_INVALID' },
    });
  });

  it('publishes an internal event to staff and a redacted event to the public room', async () => {
    const emit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as typeof gateway.server;
    const events = new QueueEventsService(queries as unknown as QueueQueryService, gateway);
    await events.statusChanged(ticket.appointmentId, null, 'WALK_IN');
    expect(queries.ticket).toHaveBeenCalledWith(ticket.appointmentId);
    expect(gateway.server.to).toHaveBeenNthCalledWith(1, QUEUE_RECEPTION_ROOM);
    expect(gateway.server.to).toHaveBeenNthCalledWith(2, QUEUE_DOCTOR_ROOM(doctorId));
    expect(gateway.server.to).toHaveBeenNthCalledWith(3, QUEUE_PUBLIC_ROOM);
    expect(emit).toHaveBeenCalledWith(APPOINTMENT_STATUS_CHANGED_EVENT, expect.objectContaining({
      appointmentId: ticket.appointmentId,
      status: AppointmentStatus.CHECKED_IN,
      ticket,
    }));
    const publicCall = emit.mock.calls.find(([name]) => name === QUEUE_PUBLIC_STATUS_CHANGED_EVENT);
    expect(publicCall?.[1]).toEqual({
      doctorId, queueNumber: ticket.queueNumber, previousStatus: null,
      status: ticket.status, occurredAt: expect.any(String),
      ticket: {
        doctorId, doctorName: ticket.doctorName, roomNumber: ticket.roomNumber,
        maskedPatientName: 'Pati***', status: ticket.status,
        queueNumber: ticket.queueNumber, queueDate: ticket.queueDate,
      },
    });
    expect(JSON.stringify(publicCall?.[1])).not.toContain(ticket.appointmentCode);
    expect(JSON.stringify(publicCall?.[1])).not.toContain(ticket.appointmentId);
    expect(publicCall?.[1].ticket.maskedPatientName).not.toBe(ticket.patientName);
  });

  it('accepts a board token only into the public room with a redacted snapshot', async () => {
    const socket = client(token, 'board-socket', 'board-token');
    socket.handshake.auth.token = undefined;
    await gateway.handleConnection(socket as unknown as Socket);

    expect(boardTokens.verify).toHaveBeenCalledWith('board-token');
    expect(sessions.authenticate).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith(QUEUE_PUBLIC_ROOM);
    expect(socket.join).not.toHaveBeenCalledWith(QUEUE_RECEPTION_ROOM);
    expect(queries.publicSnapshot).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(QUEUE_SNAPSHOT_EVENT, {
      scope: 'PUBLIC', date: ticket.queueDate, items: [toPublicQueueTicket(ticket)],
    });
    await gateway.sync(socket as unknown as Socket);
    expect(boardTokens.verify).toHaveBeenCalledTimes(2);
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('rejects a handshake containing both staff and board tokens', async () => {
    const socket = client(token, 'mixed-socket', 'board-token');
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(sessions.authenticate).not.toHaveBeenCalled();
    expect(boardTokens.verify).not.toHaveBeenCalled();
  });

  it('disconnects a public board when its token expires during sync', async () => {
    const socket = client(token, 'board-socket', 'board-token');
    socket.handshake.auth.token = undefined;
    await gateway.handleConnection(socket as unknown as Socket);
    boardTokens.verify.mockImplementationOnce(() => {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    });

    await gateway.sync(socket as unknown as Socket);

    expect(socket.emit).toHaveBeenCalledWith(QUEUE_AUTH_EXPIRED_EVENT);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('still publishes to the doctor room if reception publish fails', async () => {
    const doctorEmit = jest.fn();
    gateway.server = {
      to: jest.fn((room: string) => {
        if (room === QUEUE_RECEPTION_ROOM) throw new Error('reception room failed');
        return { emit: doctorEmit };
      }),
    } as unknown as typeof gateway.server;
    const events = new QueueEventsService(queries as unknown as QueueQueryService, gateway);

    await events.statusChanged(ticket.appointmentId, null, 'WALK_IN');

    expect(gateway.server.to).toHaveBeenCalledWith(QUEUE_DOCTOR_ROOM(doctorId));
    expect(doctorEmit).toHaveBeenCalledWith(APPOINTMENT_STATUS_CHANGED_EVENT,
      expect.objectContaining({ appointmentId: ticket.appointmentId }));
    expect(gateway.server.to).toHaveBeenCalledWith(QUEUE_PUBLIC_ROOM);
    expect(doctorEmit).toHaveBeenCalledWith(QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
      expect.objectContaining({ queueNumber: ticket.queueNumber }));
  });

  it('reconciles a missed event with a fresh snapshot every 30 seconds', async () => {
    jest.useFakeTimers();
    try {
      const socket = client();
      await gateway.handleConnection(socket as unknown as Socket);
      queries.snapshot.mockClear();

      await jest.advanceTimersByTimeAsync(30_000);

      expect(queries.snapshot).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenLastCalledWith(QUEUE_SNAPSHOT_EVENT,
        expect.objectContaining({ doctorId }));
      gateway.handleDisconnect(socket as unknown as Socket);
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps simultaneous sockets for one account', async () => {
    const sockets = Array.from({ length: 6 }, (_, index) => client(token, `socket-${index}`));
    for (const socket of sockets) await gateway.handleConnection(socket as unknown as Socket);

    expect(sockets[5].join).not.toHaveBeenCalled();
    expect(sockets[5].disconnect).toHaveBeenCalledWith(true);
    for (const socket of sockets) gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('limits repeated manual queue.sync requests from one socket', async () => {
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    queries.snapshot.mockClear();

    await gateway.sync(socket as unknown as Socket);
    await gateway.sync(socket as unknown as Socket);

    expect(queries.snapshot).toHaveBeenCalledTimes(1);
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('queries the doctor queue by date, active status, and doctor identity', async () => {
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    database.getRepository.mockReturnValue({ createQueryBuilder: () => builder });
    const service = new QueueQueryService(database as unknown as DataSource);
    const snapshot = await service.snapshot('DOCTOR', doctorId);
    expect(snapshot).toEqual(expect.objectContaining({ scope: 'DOCTOR', doctorId, items: [] }));
    expect(builder.where).toHaveBeenCalledWith('appointment.queue_date = :date', expect.any(Object));
    expect(builder.andWhere).toHaveBeenCalledWith('appointment.doctor_id = :doctorId', { doctorId });
    expect(builder.andWhere).toHaveBeenCalledWith('appointment.status IN (:...statuses)', {
      statuses: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_CONSULTATION],
    });
    expect(builder.addOrderBy).toHaveBeenCalledWith('appointment.queue_number', 'ASC');
  });

  it('redacts the persisted queue before returning a public snapshot', async () => {
    const service = new QueueQueryService(database as unknown as DataSource);
    jest.spyOn(service, 'snapshot').mockResolvedValue({
      scope: 'RECEPTION', date: ticket.queueDate, items: [ticket],
    });

    const snapshot = await service.publicSnapshot();

    expect(snapshot).toEqual({
      scope: 'PUBLIC', date: ticket.queueDate, items: [toPublicQueueTicket(ticket)],
    });
    expect(snapshot.items[0]).not.toHaveProperty('appointmentId');
    expect(snapshot.items[0]).not.toHaveProperty('appointmentCode');
  });
});
