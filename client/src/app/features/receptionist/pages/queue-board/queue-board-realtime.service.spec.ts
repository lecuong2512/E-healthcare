import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Socket } from 'socket.io-client';

import {
  QUEUE_NAMESPACE,
  QUEUE_SNAPSHOT_EVENT,
  QUEUE_SYNC_EVENT,
} from '@shared/constants/queue-socket.constants';
import { SOCKET_CLIENT_FACTORY } from '../../../../core/services/socket.service';
import { ReceptionistApiService } from '../../data-access/receptionist-api.service';
import { QueueBoardRealtimeService } from './queue-board-realtime.service';

describe('QueueBoardRealtimeService', () => {
  it('exchanges the receptionist session for a board token and syncs on connect', () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const managerListeners = new Map<string, (...args: any[]) => void>();
    const socket = {
      on: jasmine.createSpy().and.callFake((event: string, handler: (...args: any[]) => void) => {
        listeners.set(event, handler);
        return socket;
      }),
      emit: jasmine.createSpy(),
      connect: jasmine.createSpy(),
      disconnect: jasmine.createSpy(),
      removeAllListeners: jasmine.createSpy(),
      io: {
        on: jasmine.createSpy().and.callFake((event: string, handler: (...args: any[]) => void) => {
          managerListeners.set(event, handler);
        }),
        removeAllListeners: jasmine.createSpy(),
      },
    };
    const socketFactory = jasmine.createSpy().and.returnValue(socket as unknown as Socket);
    const connectionState = jasmine.createSpy();
    const snapshot = jasmine.createSpy();

    TestBed.configureTestingModule({
      providers: [
        QueueBoardRealtimeService,
        {
          provide: ReceptionistApiService,
          useValue: {
            issueQueueBoardToken: () => of({
              token: 'public-board-token',
              expiresAt: '2026-09-25T00:00:00.000Z',
            }),
          },
        },
        { provide: SOCKET_CLIENT_FACTORY, useValue: socketFactory },
      ],
    });

    const release = TestBed.inject(QueueBoardRealtimeService).connect({
      snapshot,
      statusChanged: jasmine.createSpy(),
      connectionState,
    });

    expect(socketFactory).toHaveBeenCalledWith(
      QUEUE_NAMESPACE,
      jasmine.objectContaining({ auth: { boardToken: 'public-board-token' } }),
    );
    expect(socket.connect).toHaveBeenCalled();

    listeners.get('connect')?.();
    expect(connectionState).toHaveBeenCalledWith('connected');
    expect(socket.emit).toHaveBeenCalledWith(QUEUE_SYNC_EVENT);

    listeners.get(QUEUE_SNAPSHOT_EVENT)?.({ scope: 'PUBLIC', date: '2026-09-24', items: [] });
    expect(snapshot).toHaveBeenCalled();

    release();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
