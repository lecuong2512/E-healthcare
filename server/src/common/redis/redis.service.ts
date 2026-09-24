import {
  Injectable,
  OnApplicationShutdown,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import Redis from 'ioredis';
import { environment } from '../../config/environment';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  // Atomic Lua script to release lock only if the caller is the owner
  private static readonly RELEASE_LOCK_LUA = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    customClient?: Redis,
  ) {
    if (customClient) {
      this.client = customClient;
    } else {
      const host = environment.REDIS_HOST || 'localhost';
      const port = Number(environment.REDIS_PORT || 6379);
      const password = environment.REDIS_PASSWORD || undefined;

      this.client = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts
          }
          return Math.min(times * 100, 1000);
        },
      });

      this.client.on('error', (err) => {
        this.logger.error(`Redis connection error: ${err.message}`);
      });
    }
  }

  /**
   * Acquire a distributed lock atomically using SET NX EX.
   * @param key Lock key e.g. lock:doctor:{doctorId}:slot:{slotId}
   * @param value Owner identifier e.g. userId
   * @param ttlSeconds Time-to-live in seconds (e.g. 600)
   * @returns boolean true if lock was acquired, false if already locked
   */
  async setNxEx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Get value for key.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Get remaining TTL in seconds for a key.
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Delete key.
   */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Release lock safely using atomic Lua script.
   * Only deletes key if current value matches owner.
   * @param key Lock key
   * @param owner Owner identifier (userId)
   * @returns true if released, false if key didn't exist or belonged to someone else
   */
  async releaseLockIfOwner(key: string, owner: string): Promise<boolean> {
    const result = await this.client.eval(
      RedisService.RELEASE_LOCK_LUA,
      1,
      key,
      owner,
    );
    return result === 1;
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) await this.client.expire(key, ttlSeconds);
    return value;
  }

  getClient(): Redis {
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      if (this.client.status === 'ready' || this.client.status === 'connecting') {
        await this.client.quit();
      }
    } catch (err: any) {
      this.logger.warn(`Error closing Redis connection: ${err.message}`);
    }
  }
}
