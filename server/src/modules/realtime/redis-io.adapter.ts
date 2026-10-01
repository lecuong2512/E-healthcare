import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';
import { RedisService } from '../../common/redis/redis.service';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(app: INestApplicationContext, private readonly redis: RedisService) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    this.pubClient = this.redis.getClient().duplicate();
    this.subClient = this.redis.getClient().duplicate();
    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    } catch (error) {
      await this.disconnectRedis();
      throw error;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (!this.adapterConstructor) throw new Error('Redis Socket.IO adapter is not connected');
    server.adapter(this.adapterConstructor);
    return server;
  }

  async dispose(): Promise<void> {
    await this.disconnectRedis();
  }

  private async disconnectRedis(): Promise<void> {
    const clients = [this.pubClient, this.subClient];
    this.pubClient = undefined;
    this.subClient = undefined;
    await Promise.all(clients.map(async (client) => {
      if (!client) return;
      if (client.status === 'ready') await client.quit();
      else client.disconnect();
    }));
  }
}
