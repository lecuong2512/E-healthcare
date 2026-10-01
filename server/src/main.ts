import "reflect-metadata";
import { environment } from "./config/environment";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
import { RedisService } from "./common/redis/redis.service";
import { RedisIoAdapter } from "./modules/realtime/redis-io.adapter";
import express from 'express';
import { join } from 'node:path';

import { existsSync, mkdirSync } from 'node:fs';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const uploadDirs = [
    join(process.cwd(), 'uploads'),
    join(process.cwd(), 'server', 'uploads'),
    join(__dirname, '..', '..', 'uploads'),
  ];
  for (const dir of uploadDirs) {
    if (existsSync(dir)) {
      app.use('/uploads', express.static(dir));
    }
  }
  const defaultUploads = join(process.cwd(), 'uploads');
  if (!existsSync(defaultUploads)) {
    mkdirSync(defaultUploads, { recursive: true });
  }
  mkdirSync(join(defaultUploads, 'avatars'), { recursive: true });
  mkdirSync(join(defaultUploads, 'specialty-icons'), { recursive: true });
  app.use('/uploads', express.static(defaultUploads));
  if (environment.QUEUE_REDIS_ADAPTER_ENABLED === 'true') {
    const adapter = new RedisIoAdapter(app, app.get(RedisService));
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
  }
  app.enableShutdownHooks();
  await app.listen(Number(environment.PORT ?? 3000));
}

void bootstrap();
