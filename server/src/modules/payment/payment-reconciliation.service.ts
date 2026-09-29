import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentTransactionStatus,
} from '@shared/enums';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../../database/entities/payment-trans.entity';
import { MOMO_PROVIDER, VNPAY_PROVIDER } from './constants/payment.constants';
import { PaymentFinalizerService } from './payment-finalizer.service';
import { PaymentProvider } from './providers/payment-provider.interface';

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly finalizer: PaymentFinalizerService,
    @Inject(VNPAY_PROVIDER) private readonly vnpay: PaymentProvider,
    @Inject(MOMO_PROVIDER) private readonly momo: PaymentProvider,
  ) {}

  @Cron('*/2 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async reconcileExpired(now = new Date()): Promise<number> {
    if (this.running || !this.dataSource.isInitialized) return 0;
    this.running = true;
    try {
      const transactions = await this.dataSource
        .getRepository(PaymentTransactionEntity)
        .find({
          where: [
            {
              status: PaymentTransactionStatus.PENDING,
              expiresAt: LessThanOrEqual(now),
            },
            {
              status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
              reconciliationManualReview: false,
              nextReconcileAt: LessThanOrEqual(now),
            },
          ],
          order: { expiresAt: 'ASC' },
          take: 50,
        });
      let processed = 0;
      for (const transaction of transactions) {
        await this.reconcileOne(transaction, now);
        processed += 1;
      }
      const orphanAppointments = await this.dataSource
        .getRepository(AppointmentEntity)
        .find({
          where: {
            status: AppointmentStatus.PENDING_PAYMENT,
            reservationExpiresAt: LessThanOrEqual(now),
          },
          order: { reservationExpiresAt: 'ASC' },
          take: 50,
        });
      for (const appointment of orphanAppointments) {
        if (await this.finalizer.expireOrphanAppointment(appointment.id, now)) {
          processed += 1;
        }
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  private async reconcileOne(
    transaction: PaymentTransactionEntity,
    now: Date,
  ): Promise<void> {
    try {
      const result = await this.provider(transaction.provider).queryStatus(transaction);
      const outcome = await this.finalizer.finalize(result);
      if (outcome === 'PENDING' || outcome === 'RECONCILIATION_REQUIRED') {
        await this.finalizer.expireReservationForReconciliation(
          transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
          transaction.merchantTransactionId,
        );
        await this.finalizer.scheduleReconciliationRetry(
          transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
          transaction.merchantTransactionId,
          `Provider returned ${result.state}`,
          now,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Payment query failed for ${transaction.merchantTransactionId}: ${message}`,
      );
      await this.finalizer.expireReservationForReconciliation(
        transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
        transaction.merchantTransactionId,
      );
      await this.finalizer.scheduleReconciliationRetry(
        transaction.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
        transaction.merchantTransactionId,
        message,
        now,
      );
    }
  }

  private provider(method: PaymentMethod): PaymentProvider {
    if (method === PaymentMethod.VNPAY) return this.vnpay;
    if (method === PaymentMethod.MOMO) return this.momo;
    throw new Error(`Unsupported reconciliation provider: ${method}`);
  }
}
