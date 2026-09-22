import "reflect-metadata";
import { environment } from "./config/environment";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
import { RedisService } from "./common/redis/redis.service";
import { RedisIoAdapter } from "./modules/realtime/redis-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  if (environment.QUEUE_REDIS_ADAPTER_ENABLED === 'true') {
    const adapter = new RedisIoAdapter(app, app.get(RedisService));
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
  }
  app.enableShutdownHooks();
  await app.listen(Number(environment.PORT ?? 3000));
}

void bootstrap();
