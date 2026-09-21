import { sign } from 'jsonwebtoken';
import { Role, AppointmentStatus, QueueSource } from '@shared/enums';
import { QueueTicket } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { Socket } from 'socket.io';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { SessionService } from '../src/modules/auth/session.service';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';
import { QueueGateway } from '../src/modules/realtime/queue.gateway';
import { QueueQueryService } from '../src/modules/realtime/queue-query.service';
import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_DOCTOR_ROOM,
  QUEUE_RECEPTION_ROOM,
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
  const queries = { snapshot: jest.fn(), ticket: jest.fn() };
  const doctorRepository = { findOneBy: jest.fn() };
  const database = { getRepository: jest.fn() };
  let gateway: QueueGateway;

  function client(authToken: unknown = token) {
    return {
      id: 'socket-1',
      handshake: { auth: { token: authToken } },
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
    queries.ticket.mockResolvedValue(ticket);
    gateway = new QueueGateway(
      sessions as unknown as SessionService,
      database as unknown as DataSource,
      queries as unknown as QueueQueryService,
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
    gateway.handleDisconnect(socket as unknown as Socket);
  });

  it('publishes a committed ticket only to reception and its doctor room', async () => {
    const emit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as typeof gateway.server;
    const events = new QueueEventsService(queries as unknown as QueueQueryService, gateway);
    await events.statusChanged(ticket.appointmentId, null, 'WALK_IN');
    expect(queries.ticket).toHaveBeenCalledWith(ticket.appointmentId);
    expect(gateway.server.to).toHaveBeenNthCalledWith(1, QUEUE_RECEPTION_ROOM);
    expect(gateway.server.to).toHaveBeenNthCalledWith(2, QUEUE_DOCTOR_ROOM(doctorId));
    expect(emit).toHaveBeenCalledWith(APPOINTMENT_STATUS_CHANGED_EVENT, expect.objectContaining({
      appointmentId: ticket.appointmentId,
      status: AppointmentStatus.CHECKED_IN,
      ticket,
    }));
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
});
