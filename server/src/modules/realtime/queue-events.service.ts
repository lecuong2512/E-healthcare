import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { PublicQueueStatusChanged, QueueStatusChanged } from '@shared/interfaces';
import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_DOCTOR_ROOM,
  QUEUE_RECEPTION_ROOM,
  QUEUE_PUBLIC_ROOM,
  QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
} from '../../../../shared/src/constants/queue-socket.constants';
import { QueueGateway } from './queue.gateway';
import { QueueQueryService } from './queue-query.service';
import { toPublicQueueTicket } from './public-queue.mapper';

@Injectable()
export class QueueEventsService {
  private readonly logger = new Logger(QueueEventsService.name);

  constructor(
    private readonly queries: QueueQueryService,
    private readonly gateway: QueueGateway,
  ) {}

  async statusChanged(
    appointmentId: string,
    previousStatus: AppointmentStatus | null,
    source: QueueStatusChanged['source'],
  ): Promise<void> {
    try {
      const ticket = await this.queries.ticket(appointmentId);
      if (!ticket) throw new Error('Queue ticket missing after commit');
      const event: QueueStatusChanged = {
        appointmentId: ticket.appointmentId,
        appointmentCode: ticket.appointmentCode,
        doctorId: ticket.doctorId,
        previousStatus,
        status: ticket.status,
        queueNumber: ticket.queueNumber,
        source,
        occurredAt: new Date().toISOString(),
        ticket,
      };
      for (const room of [QUEUE_RECEPTION_ROOM, QUEUE_DOCTOR_ROOM(ticket.doctorId)]) {
        try {
          this.gateway.emitToRoom(room, APPOINTMENT_STATUS_CHANGED_EVENT, event);
        } catch (error) {
          this.logger.warn(`Queue event failed for appointment ${appointmentId}, room ${room}: ${String(error)}`);
        }
      }
      const publicEvent: PublicQueueStatusChanged = {
        doctorId: ticket.doctorId,
        queueNumber: ticket.queueNumber,
        previousStatus,
        status: ticket.status,
        occurredAt: event.occurredAt,
        ticket: toPublicQueueTicket(ticket),
      };
      try {
        this.gateway.emitToRoom(QUEUE_PUBLIC_ROOM, QUEUE_PUBLIC_STATUS_CHANGED_EVENT, publicEvent);
      } catch (error) {
        this.logger.warn(`Public queue event failed for appointment ${appointmentId}: ${String(error)}`);
      }
    } catch (error) {
      this.logger.warn(`Queue event failed for appointment ${appointmentId}: ${String(error)}`);
    }
  }
}
