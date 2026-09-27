import { Injectable, inject } from '@angular/core';
import { Socket } from 'socket.io-client';

import {
  QUEUE_AUTH_EXPIRED_EVENT,
  QUEUE_NAMESPACE,
  QUEUE_PUBLIC_STATUS_CHANGED_EVENT,
  QUEUE_SNAPSHOT_EVENT,
  QUEUE_SYNC_EVENT,
} from '@shared/constants/queue-socket.constants';
import {
  PublicQueueSnapshot,
  PublicQueueStatusChanged,
} from '@shared/interfaces';
import {
  SOCKET_CLIENT_FACTORY,
} from '../../../../core/services/socket.service';
import { environment } from '../../../../../environments/environment';
import { ReceptionistApiService } from '../../data-access/receptionist-api.service';
import { QueueBoardConnectionState } from './queue-board.models';

export interface QueueBoardRealtimeHandlers {
  readonly snapshot: (snapshot: PublicQueueSnapshot) => void;
  readonly statusChanged: (event: PublicQueueStatusChanged) => void;
  readonly connectionState: (state: QueueBoardConnectionState) => void;
}

@Injectable({ providedIn: 'root' })
export class QueueBoardRealtimeService {
  private readonly api = inject(ReceptionistApiService);
  private readonly socketFactory = inject(SOCKET_CLIENT_FACTORY);

  connect(handlers: QueueBoardRealtimeHandlers): () => void {
    let socket: Socket | undefined;
    let stopped = false;
    handlers.connectionState('connecting');

    const tokenSubscription = this.api.issueQueueBoardToken().subscribe({
      next: ({ token }) => {
        if (stopped) return;
        socket = this.socketFactory(
          `${environment.socketBaseUrl}${QUEUE_NAMESPACE}`,
          {
            path: environment.socketPath,
            autoConnect: false,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1_000,
            reconnectionDelayMax: 10_000,
            timeout: 10_000,
            auth: { boardToken: token },
          },
        );

        socket.on('connect', () => {
          handlers.connectionState('connected');
          socket?.emit(QUEUE_SYNC_EVENT);
        });
        socket.on('connect_error', () => handlers.connectionState('error'));
        socket.on('disconnect', (reason) => {
          if (!stopped && reason !== 'io client disconnect') {
            handlers.connectionState('reconnecting');
          }
        });
        socket.io.on('reconnect_attempt', () =>
          handlers.connectionState('reconnecting'),
        );
        socket.on(QUEUE_SNAPSHOT_EVENT, handlers.snapshot);
        socket.on(QUEUE_PUBLIC_STATUS_CHANGED_EVENT, handlers.statusChanged);
        socket.on(QUEUE_AUTH_EXPIRED_EVENT, () => {
          handlers.connectionState('expired');
          socket?.disconnect();
        });
        socket.connect();
      },
      error: () => handlers.connectionState('error'),
    });

    return () => {
      stopped = true;
      tokenSubscription.unsubscribe();
      socket?.removeAllListeners();
      socket?.io.removeAllListeners();
      socket?.disconnect();
      handlers.connectionState('disconnected');
    };
  }
}
