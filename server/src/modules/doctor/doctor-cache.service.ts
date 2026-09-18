import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { createClient, RedisClientType } from "redis";
import { environment } from "../../config/environment";

const CACHE_PREFIX = "ehealth:doctor:";

@Injectable()
export class DoctorCacheService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DoctorCacheService.name);
  private readonly client: RedisClientType;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.client = createClient({ url: this.redisUrl() });
    this.client.on("error", (error) =>
      this.logger.warn(`Redis cache unavailable: ${error.message}`),
    );
  }

  onModuleInit(): void {
    void this.client
      .connect()
      .catch(() =>
        this.logger.warn("Doctor cache will use database fallback."),
      );
  }

  onApplicationShutdown(): void {
    if (this.client.isOpen) this.client.destroy();
  }

  key(namespace: string, value: unknown): string {
    const digest = createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex");
    return `${CACHE_PREFIX}${namespace}:${digest}`;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client.isReady) {
      this.misses += 1;
      return null;
    }
    try {
      const value = await this.client.get(key);
      if (value === null) {
        this.misses += 1;
        return null;
      }
      this.hits += 1;
      return JSON.parse(value) as T;
    } catch {
      this.misses += 1;
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!this.client.isReady) return;
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch {
      this.logger.warn("Could not write doctor data to Redis cache.");
    }
  }

  async invalidateDoctorData(doctorId: string): Promise<void> {
    if (!this.client.isReady) return;
    const keys: string[] = [];
    for await (const entry of this.client.scanIterator({
      MATCH: `${CACHE_PREFIX}list:*`,
      COUNT: 100,
    })) {
      if (Array.isArray(entry)) keys.push(...entry);
      else keys.push(entry);
    }
    keys.push(this.key("detail", doctorId));
    if (keys.length > 0) await this.client.del(keys);
  }

  stats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  private redisUrl(): string {
    if (environment.REDIS_URL) return environment.REDIS_URL;
    const host = environment.REDIS_HOST || "localhost";
    const port = environment.REDIS_PORT || "6379";
    const password = environment.REDIS_PASSWORD
      ? `:${encodeURIComponent(environment.REDIS_PASSWORD)}@`
      : "";
    return `redis://${password}${host}:${port}`;
  }
}
