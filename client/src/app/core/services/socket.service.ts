import { Injectable, InjectionToken, effect, inject, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { QUEUE_AUTH_EXPIRED_EVENT } from '@shared/constants/queue-socket.constants';

import { environment } from '../../../environments/environment';
import { TokenStoreService } from './token-store.service';

export type SocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'expired'
  | 'error';

type SocketClientFactory = (
  uri: string,
  options: Parameters<typeof io>[1],
) => Socket;

export const SOCKET_CLIENT_FACTORY = new InjectionToken<SocketClientFactory>(
  'SOCKET_CLIENT_FACTORY',
  { providedIn: 'root', factory: () => io },
);

/**
 * Owns authenticated Socket.IO connections for the web client.
 *
 * Access tokens remain in memory and are supplied by callback for every
 * handshake. A refreshed token therefore never needs to be persisted. Public
 * Queue Board sessions deliberately use a separate adapter and board token.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly tokenStore = inject(TokenStoreService);
  private readonly socketFactory = inject(SOCKET_CLIENT_FACTORY);
  private readonly sockets = new Map<string, Socket>();
  private readonly expiredNamespaces = new Set<string>();
  private readonly _connectionStates = signal<
    Readonly<Record<string, SocketConnectionState>>
  >({});

  readonly connectionStates = this._connectionStates.asReadonly();

  constructor() {
    let previousToken: string | null = null;

    effect(
      () => {
        const currentToken = this.tokenStore.accessToken();

        if (currentToken === previousToken) {
          return;
        }

        previousToken = currentToken;

        for (const [namespace, socket] of this.sockets) {
          this.expiredNamespaces.delete(namespace);
          if (!currentToken) {
            socket.disconnect();
            this.setState(namespace, 'disconnected');
            continue;
          }

          // Force a new namespace handshake so the server receives the new
          // in-memory token after login or refresh.
          socket.disconnect();
          this.setState(namespace, 'connecting');
          socket.connect();
        }
      },
      { allowSignalWrites: true },
    );
  }

  connect(namespace: string): Socket {
    const normalizedNamespace = this.normalizeNamespace(namespace);
    const existingSocket = this.sockets.get(normalizedNamespace);

    if (existingSocket) {
      if (!existingSocket.connected && this.tokenStore.accessToken() && !this.expiredNamespaces.has(normalizedNamespace)) {
        this.setState(normalizedNamespace, 'connecting');
        existingSocket.connect();
      }

      return existingSocket;
    }

    const socket = this.socketFactory(
      `${environment.socketBaseUrl}${normalizedNamespace}`,
      {
        path: environment.socketPath,
        autoConnect: false,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
        timeout: 10_000,
        auth: (callback) => {
          callback({ token: this.tokenStore.accessToken() });
        },
      },
    );

    this.registerLifecycleListeners(normalizedNamespace, socket);
    this.sockets.set(normalizedNamespace, socket);
    this.setState(normalizedNamespace, 'disconnected');

    if (this.tokenStore.accessToken()) {
      this.setState(normalizedNamespace, 'connecting');
      socket.connect();
    }

    return socket;
  }

  getSocket(namespace: string): Socket | undefined {
    return this.sockets.get(this.normalizeNamespace(namespace));
  }

  disconnect(namespace?: string): void {
    if (namespace) {
      this.disconnectNamespace(this.normalizeNamespace(namespace));
      return;
    }

    for (const registeredNamespace of [...this.sockets.keys()]) {
      this.disconnectNamespace(registeredNamespace);
    }
  }

  private registerLifecycleListeners(
    namespace: string,
    socket: Socket,
  ): void {
    socket.on('connect', () => {
      this.expiredNamespaces.delete(namespace);
      this.setState(namespace, 'connected');
    });
    socket.on(QUEUE_AUTH_EXPIRED_EVENT, () => {
      this.expiredNamespaces.add(namespace);
      this.setState(namespace, 'expired');
      socket.disconnect();
    });
    socket.on('connect_error', () => this.setState(namespace, 'error'));
    socket.on('disconnect', () => {
      if (!this.expiredNamespaces.has(namespace)) this.setState(namespace, 'disconnected');
    });
    socket.io.on('reconnect_attempt', () =>
      this.setState(namespace, 'reconnecting'),
    );
  }

  private disconnectNamespace(namespace: string): void {
    const socket = this.sockets.get(namespace);

    if (!socket) {
      return;
    }

    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    this.sockets.delete(namespace);
    this.expiredNamespaces.delete(namespace);
    this.setState(namespace, 'disconnected');
  }

  private normalizeNamespace(namespace: string): string {
    const trimmedNamespace = namespace.trim();

    if (!trimmedNamespace || trimmedNamespace === '/') {
      return '/';
    }

    return trimmedNamespace.startsWith('/')
      ? trimmedNamespace
      : `/${trimmedNamespace}`;
  }

  private setState(
    namespace: string,
    state: SocketConnectionState,
  ): void {
    this._connectionStates.update((states) => ({
      ...states,
      [namespace]: state,
    }));
  }
}
