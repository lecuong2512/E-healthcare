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
  private static readonly ADVISORY_LOCK_KEY = 1_347_439_185;

  constructor(
    private readonly dataSource: DataSource,
    private readonly finalizer: PaymentFinalizerService,
    @Inject(VNPAY_PROVIDER) private readonly vnpay: PaymentProvider,
    @Inject(MOMO_PROVIDER) private readonly momo: PaymentProvider,
  ) {}

  @Cron('*/2 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async reconcileExpired(now = new Date()): Promise<number> {
    if (this.running || !this.dataSource.isInitialized) return 0;
    const lockRunner = this.dataSource.createQueryRunner();
    let acquired = false;
    await lockRunner.connect();
    try {
      const rows = (await lockRunner.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [PaymentReconciliationService.ADVISORY_LOCK_KEY],
      )) as Array<{ acquired: boolean }>;
      acquired = rows[0]?.acquired === true;
      if (!acquired) {
        await lockRunner.release();
        return 0;
      }
    } catch (error) {
      await lockRunner.release();
      throw error;
    }
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
      if (acquired) {
        await lockRunner.query('SELECT pg_advisory_unlock($1)', [
          PaymentReconciliationService.ADVISORY_LOCK_KEY,
        ]);
      }
      await lockRunner.release();
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
