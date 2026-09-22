import { Logger, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@shared/enums';
import {
  QUEUE_DOCTOR_ROOM,
  QUEUE_AUTH_EXPIRED_EVENT,
  QUEUE_NAMESPACE,
  QUEUE_RECEPTION_ROOM,
  QUEUE_SNAPSHOT_EVENT,
  QUEUE_SYNC_EVENT,
} from '../../../../shared/src/constants/queue-socket.constants';
import { decode } from 'jsonwebtoken';
import { Namespace, Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import { environment } from '../../config/environment';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { SessionService } from '../auth/session.service';
import { QueueQueryService } from './queue-query.service';

type QueueClient = Socket & { data: { queueRole?: Role; doctorId?: string; token?: string } };

@WebSocketGateway({
  namespace: QUEUE_NAMESPACE,
  cors: { origin: environment.FRONTEND_URL ? new URL(environment.FRONTEND_URL).origin : false },
})
@SkipThrottle()
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;
  private readonly logger = new Logger(QueueGateway.name);
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly sessions: SessionService,
    private readonly dataSource: DataSource,
    private readonly queries: QueueQueryService,
  ) {}

  async handleConnection(client: QueueClient): Promise<void> {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string') {
      client.disconnect(true);
      return;
    }
    try {
      const claims = await this.sessions.authenticate(token);
      if (claims.role !== Role.RECEPTIONIST && claims.role !== Role.DOCTOR) {
        client.disconnect(true);
        return;
      }
      let doctorId: string | undefined;
      if (claims.role === Role.DOCTOR) {
        const doctor = await this.dataSource.getRepository(DoctorEntity)
          .findOneBy({ userId: claims.userId });
        if (!doctor) {
          client.disconnect(true);
          return;
        }
        doctorId = doctor.id;
      }
      const tokenClaims = decode(token);
      const expiresAt = typeof tokenClaims === 'object' && tokenClaims?.exp
        ? tokenClaims.exp * 1000 : 0;
      if (expiresAt <= Date.now()) {
        client.emit(QUEUE_AUTH_EXPIRED_EVENT);
        client.disconnect(true);
        return;
      }
      client.data.queueRole = claims.role;
      client.data.doctorId = doctorId;
      client.data.token = token;
      await client.join(doctorId ? QUEUE_DOCTOR_ROOM(doctorId) : QUEUE_RECEPTION_ROOM);
      const timer = setTimeout(() => {
        client.emit(QUEUE_AUTH_EXPIRED_EVENT);
        client.disconnect(true);
      }, expiresAt - Date.now());
      timer.unref();
      this.expiryTimers.set(client.id, timer);
      await this.sendSnapshot(client);
    } catch (error) {
      this.logger.warn(`Queue socket connection failed: ${String(error)}`);
      if (this.isExpiredSession(error)) client.emit(QUEUE_AUTH_EXPIRED_EVENT);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const timer = this.expiryTimers.get(client.id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(client.id);
  }

  @SubscribeMessage(QUEUE_SYNC_EVENT)
  async sync(@ConnectedSocket() client: QueueClient): Promise<void> {
    try {
      const claims = await this.sessions.authenticate(client.data.token);
      if (claims.role !== client.data.queueRole) throw new Error('Role changed');
      if (claims.role === Role.DOCTOR) {
        const doctor = await this.dataSource.getRepository(DoctorEntity)
          .findOneBy({ userId: claims.userId });
        if (!doctor || doctor.id !== client.data.doctorId) throw new Error('Doctor changed');
      }
      await this.sendSnapshot(client);
    } catch (error) {
      this.logger.warn(`Queue socket sync failed: ${String(error)}`);
      if (this.isExpiredSession(error)) client.emit(QUEUE_AUTH_EXPIRED_EVENT);
      client.disconnect(true);
    }
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }

  private async sendSnapshot(client: QueueClient): Promise<void> {
    const scope = client.data.queueRole === Role.DOCTOR ? 'DOCTOR' : 'RECEPTION';
    const snapshot = await this.queries.snapshot(scope, client.data.doctorId);
    client.emit(QUEUE_SNAPSHOT_EVENT, snapshot);
  }

  private isExpiredSession(error: unknown): boolean {
    if (!(error instanceof UnauthorizedException)) return false;
    const response = error.getResponse();
    return typeof response === 'object' && response !== null &&
      'code' in response && response.code === 'SESSION_EXPIRED';
  }
}
