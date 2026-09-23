import { Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { environment } from '../../config/environment';

export function getBullMqConnectionOptions() {
  return {
    host: environment.REDIS_HOST || 'localhost',
    port: Number(environment.REDIS_PORT || 6379),
    password: environment.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 5) {
        return null;
      }
      return Math.min(times * 200, 2000);
    },
  };
}

@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    const isMock = environment.BULLMQ_MOCK === 'true';

    if (isMock) {
      return {
        module: QueueModule,
        exports: [],
      };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          useFactory: () => ({
            connection: getBullMqConnectionOptions(),
          }),
        }),
      ],
      exports: [BullModule],
    };
  }
}
