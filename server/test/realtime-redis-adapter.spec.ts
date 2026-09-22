import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server } from 'socket.io';
import { RedisService } from '../src/common/redis/redis.service';
import { RedisIoAdapter } from '../src/modules/realtime/redis-io.adapter';

describe('RedisIoAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('attaches a shared Socket.IO adapter and closes both Redis connections', async () => {
    const pub = { connect: jest.fn(async () => undefined), status: 'ready', quit: jest.fn(async () => undefined) };
    const sub = { connect: jest.fn(async () => undefined), status: 'ready', quit: jest.fn(async () => undefined) };
    const duplicate = jest.fn().mockReturnValueOnce(pub).mockReturnValueOnce(sub);
    const redis = { getClient: () => ({ duplicate }) } as unknown as RedisService;
    const server = { adapter: jest.fn() } as unknown as Server;
    jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue(server);
    const adapter = new RedisIoAdapter({} as INestApplicationContext, redis);

    await adapter.connectToRedis();
    expect(adapter.createIOServer(0)).toBe(server);
    expect(server.adapter).toHaveBeenCalledWith(expect.any(Function));
    expect(pub.connect).toHaveBeenCalledTimes(1);
    expect(sub.connect).toHaveBeenCalledTimes(1);

    await adapter.dispose();
    expect(pub.quit).toHaveBeenCalledTimes(1);
    expect(sub.quit).toHaveBeenCalledTimes(1);
  });
});
