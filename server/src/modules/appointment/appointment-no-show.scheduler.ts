import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
@Injectable()
export class AppointmentNoShowScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AppointmentNoShowScheduler.name); private timer?: NodeJS.Timeout;
  constructor(private readonly lifecycle: AppointmentLifecycleService) {}
  onApplicationBootstrap(): void { this.timer = setInterval(() => void this.run(), 60000); void this.run(); }
  onApplicationShutdown(): void { if (this.timer) clearInterval(this.timer); }
  private async run(): Promise<void> { try { await this.lifecycle.markPastConfirmedAsNoShow(); } catch (error) { this.logger.error('Không thể quét lịch no-show.', error instanceof Error ? error.stack : undefined); } }
}
