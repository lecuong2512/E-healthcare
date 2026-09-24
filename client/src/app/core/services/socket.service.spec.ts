import { TestBed } from '@angular/core/testing';
import { Socket } from 'socket.io-client';
import { QUEUE_AUTH_EXPIRED_EVENT } from '@shared/constants/queue-socket.constants';

import {
  SOCKET_CLIENT_FACTORY,
  SocketService,
} from './socket.service';
import { TokenStoreService } from './token-store.service';

class FakeEventSource {
  private readonly listeners = new Map<string, Array<() => void>>();

  on(event: string, listener: () => void): this {
    const eventListeners = this.listeners.get(event) ?? [];
    eventListeners.push(listener);
    this.listeners.set(event, eventListeners);
    return this;
  }

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }
}

class FakeSocket extends FakeEventSource {
  connected = false;
  readonly io = new FakeEventSource();
  readonly connectSpy = jasmine.createSpy('connect');
  readonly disconnectSpy = jasmine.createSpy('disconnect');

  connect(): this {
    this.connectSpy();
    this.connected = true;
    this.emit('connect');
    return this;
  }

  disconnect(): this {
    this.disconnectSpy();
    this.connected = false;
    this.emit('disconnect');
    return this;
  }
}

describe('SocketService', () => {
  let service: SocketService;
  let tokenStore: TokenStoreService;
  let fakeSocket: FakeSocket;
  let socketOptions: Parameters<typeof import('socket.io-client').io>[1];
  let socketFactory: jasmine.Spy;

  beforeEach(() => {
    fakeSocket = new FakeSocket();
    socketFactory = jasmine
      .createSpy('socketFactory')
      .and.callFake((_uri: string, options: typeof socketOptions) => {
        socketOptions = options;
        return fakeSocket as unknown as Socket;
      });

    TestBed.configureTestingModule({
      providers: [
        TokenStoreService,
        SocketService,
        { provide: SOCKET_CLIENT_FACTORY, useValue: socketFactory },
      ],
    });

    tokenStore = TestBed.inject(TokenStoreService);
    service = TestBed.inject(SocketService);
    TestBed.flushEffects();
  });

  it('normalizes a namespace and waits for an access token', () => {
    service.connect('queue');

    expect(socketFactory).toHaveBeenCalledWith(
      '/queue',
      jasmine.objectContaining({
        autoConnect: false,
        path: '/socket.io',
      }),
    );
    expect(fakeSocket.connectSpy).not.toHaveBeenCalled();
    expect(service.connectionStates()['/queue']).toBe('disconnected');
  });

  it('connects after login and supplies the current in-memory token', () => {
    service.connect('/queue');
    tokenStore.setSession('access-token', 'RECEPTIONIST');
    TestBed.flushEffects();

    expect(fakeSocket.connectSpy).toHaveBeenCalledTimes(1);
    expect(service.connectionStates()['/queue']).toBe('connected');

    const auth = socketOptions?.auth;
    expect(typeof auth).toBe('function');

    let handshake: object | undefined;
    if (typeof auth === 'function') {
      auth((payload) => (handshake = payload));
    }
    expect(handshake).toEqual({ token: 'access-token' });
  });

  it('forces a new handshake when the access token changes', () => {
    tokenStore.setSession('first-token', 'RECEPTIONIST');
    TestBed.flushEffects();
    service.connect('/queue');

    tokenStore.setSession('refreshed-token', 'RECEPTIONIST');
    TestBed.flushEffects();

    expect(fakeSocket.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(fakeSocket.connectSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps auth expiry visible and reconnects only after token refresh', () => {
    tokenStore.setSession('first-token', 'RECEPTIONIST');
    TestBed.flushEffects();
    service.connect('/queue');
    fakeSocket.emit(QUEUE_AUTH_EXPIRED_EVENT);

    expect(service.connectionStates()['/queue']).toBe('expired');
    expect(fakeSocket.disconnectSpy).toHaveBeenCalledTimes(1);
    service.connect('/queue');
    expect(fakeSocket.connectSpy).toHaveBeenCalledTimes(1);

    tokenStore.setSession('refreshed-token', 'RECEPTIONIST');
    TestBed.flushEffects();
    expect(fakeSocket.connectSpy).toHaveBeenCalledTimes(2);
    expect(service.connectionStates()['/queue']).toBe('connected');
  });

  it('removes and disconnects registered sockets during logout cleanup', () => {
    tokenStore.setSession('access-token', 'RECEPTIONIST');
    TestBed.flushEffects();
    service.connect('/queue');

    service.disconnect();

    expect(fakeSocket.disconnectSpy).toHaveBeenCalled();
    expect(service.getSocket('/queue')).toBeUndefined();
    expect(service.connectionStates()['/queue']).toBe('disconnected');
  });
});
