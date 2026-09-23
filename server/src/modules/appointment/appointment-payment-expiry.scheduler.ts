import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';

@Injectable()
export class AppointmentPaymentExpiryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AppointmentPaymentExpiryScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly lifecycle: AppointmentLifecycleService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), 60_000);
    void this.run();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.lifecycle.expirePendingPayments();
    } catch (error) {
      this.logger.error('Không thể quét lịch chờ thanh toán quá hạn.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
