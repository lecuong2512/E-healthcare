import { Module, DynamicModule, OnModuleInit, Optional, Inject, Logger } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName } from '@shared/enums';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../common/redis/redis.module';
import { EmailSenderService } from './services/email-sender.service';
import { SmsSenderService } from './services/sms-sender.service';
import { PdfGeneratorService } from './services/pdf-generator.service';
import { EmailProcessor } from './processors/email.processor';
import { SmsProcessor } from './processors/sms.processor';
import { PdfProcessor } from './processors/pdf.processor';
import { NotificationProducerService } from './producers/notification-producer.service';
import { AppointmentCronService } from './schedulers/appointment-cron.service';
import { environment } from '../../config/environment';

export class MockBullQueue {
  public jobs: any[] = [];
  constructor(public readonly name: string) {}

  async add(name: string, data: any, opts?: any) {
    const job = { id: `mock-${Date.now()}-${Math.random()}`, name, data, opts };
    this.jobs.push(job);
    return job;
  }
  async close() {}
  on() { return this; }
}

@Module({})
export class NotificationModule implements OnModuleInit {
  private readonly logger = new Logger(NotificationModule.name);

  constructor(
    @Optional()
    @Inject(getQueueToken(QueueName.EMAIL))
    private readonly emailQueue?: Queue,
    @Optional()
    @Inject(getQueueToken(QueueName.SMS))
    private readonly smsQueue?: Queue,
    @Optional()
    @Inject(getQueueToken(QueueName.PDF))
    private readonly pdfQueue?: Queue,
  ) {}

  onModuleInit() {
    const queues = [this.emailQueue, this.smsQueue, this.pdfQueue].filter(Boolean);
    for (const q of queues) {
      if (q && typeof q.on === 'function') {
        q.on('error', (err: any) => {
          this.logger.warn(`BullMQ Queue [${q.name}] connection warning: ${err?.message || err}`);
        });
      }
    }
  }

  static register(): DynamicModule {
    const isMock = environment.BULLMQ_MOCK === 'true';

    const commonProviders = [
      EmailSenderService,
      SmsSenderService,
      PdfGeneratorService,
      EmailProcessor,
      SmsProcessor,
      PdfProcessor,
      NotificationProducerService,
      AppointmentCronService,
    ];

    if (isMock) {
      const mockEmail = new MockBullQueue(QueueName.EMAIL);
      const mockSms = new MockBullQueue(QueueName.SMS);
      const mockPdf = new MockBullQueue(QueueName.PDF);

      return {
        module: NotificationModule,
        imports: [DatabaseModule, RedisModule],
        providers: [
          ...commonProviders,
          { provide: getQueueToken(QueueName.EMAIL), useValue: mockEmail },
          { provide: getQueueToken(QueueName.SMS), useValue: mockSms },
          { provide: getQueueToken(QueueName.PDF), useValue: mockPdf },
        ],
        exports: [
          NotificationProducerService,
          AppointmentCronService,
          EmailSenderService,
          SmsSenderService,
          PdfGeneratorService,
        ],
      };
    }

    return {
      module: NotificationModule,
      imports: [
        DatabaseModule,
        RedisModule,
        BullModule.registerQueue(
          { name: QueueName.EMAIL },
          { name: QueueName.SMS },
          { name: QueueName.PDF },
        ),
      ],
      providers: commonProviders,
      exports: [
        NotificationProducerService,
        AppointmentCronService,
        EmailSenderService,
        SmsSenderService,
        PdfGeneratorService,
        BullModule,
      ],
    };
  }
}
