import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';

@Injectable()
export class AppointmentPaymentExpiryScheduler {
  private readonly logger = new Logger(AppointmentPaymentExpiryScheduler.name);
  private running = false;

  constructor(private readonly lifecycle: AppointmentLifecycleService) {}

  @Cron('*/2 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async expirePendingPayments(): Promise<void> {
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
