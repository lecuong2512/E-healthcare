import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@shared/enums';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { PaymentTransactionEntity } from '../../database/entities/payment-trans.entity';
import { RefundRequestEntity } from '../../database/entities/refund-request.entity';
import { MOMO_PROVIDER, VNPAY_PROVIDER } from './constants/payment.constants';
import { PaymentFinalizerService } from './payment-finalizer.service';
import { PaymentProvider } from './providers/payment-provider.interface';
import { PaymentConfiguration } from './payment-config';
import { ReconciliationResolution } from './dto';

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private running = false;
  private static readonly ADVISORY_LOCK_KEY = 1_347_439_185;

  constructor(
    private readonly dataSource: DataSource,
    private readonly finalizer: PaymentFinalizerService,
    private readonly configuration: PaymentConfiguration,
    @Inject(VNPAY_PROVIDER) private readonly vnpay: PaymentProvider,
    @Inject(MOMO_PROVIDER) private readonly momo: PaymentProvider,
  ) {}

  @Cron('*/2 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async reconcileExpired(now = new Date()): Promise<number> {
    if (!this.configuration.isEnabled() || this.running || !this.dataSource.isInitialized) return 0;
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

  async manualReviewTransactions() {
    const transactions = await this.dataSource.getRepository(PaymentTransactionEntity).find({
      where: {
        status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
        reconciliationManualReview: true,
      },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return transactions.map((transaction) => ({
      transactionId: transaction.id,
      appointmentId: transaction.appointmentId,
      provider: transaction.provider,
      merchantTransactionId: transaction.merchantTransactionId,
      amountVnd: Number(transaction.amountVnd),
      status: transaction.status,
      reconciliationAttempts: transaction.reconciliationAttempts,
      lastReconcileError: transaction.lastReconcileError,
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt,
    }));
  }

  async manualReconcile(transactionId: string, adminId: string) {
    this.configuration.ensureEnabled();
    const transaction = await this.manualTransaction(transactionId);
    this.audit(adminId, transactionId, 'RETRY_PROVIDER_QUERY');
    await this.reconcileOne(transaction, new Date());
    return this.dataSource.getRepository(PaymentTransactionEntity).findOneByOrFail({
      id: transactionId,
    });
  }

  async resolveManual(
    transactionId: string,
    adminId: string,
    outcome: ReconciliationResolution,
  ) {
    if (outcome === 'RETRY_PROVIDER_QUERY') {
      return this.manualReconcile(transactionId, adminId);
    }
    const snapshot = await this.manualTransaction(transactionId);
    if (outcome === 'MARK_FAILED') {
      await this.finalizer.expireReservationForReconciliation(
        snapshot.provider as PaymentMethod.VNPAY | PaymentMethod.MOMO,
        snapshot.merchantTransactionId,
      );
      const result = await this.dataSource.getRepository(PaymentTransactionEntity).update(
        {
          id: transactionId,
          status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
          reconciliationManualReview: true,
        },
        {
          status: PaymentTransactionStatus.FAILED,
          reconciliationManualReview: false,
          nextReconcileAt: null,
          lastReconcileError: 'Manually marked failed by an administrator.',
        },
      );
      if (result.affected !== 1) throw new ConflictException('Transaction state changed.');
      this.audit(adminId, transactionId, outcome);
      return this.dataSource.getRepository(PaymentTransactionEntity).findOneByOrFail({
        id: transactionId,
      });
    }

    const refund = await this.dataSource.transaction(async (manager) => {
      const transaction = await manager.getRepository(PaymentTransactionEntity)
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.id = :transactionId', { transactionId })
        .getOne();
      if (
        !transaction ||
        transaction.status !== PaymentTransactionStatus.RECONCILIATION_REQUIRED ||
        !transaction.reconciliationManualReview
      ) throw new ConflictException('Transaction is not awaiting manual review.');
      const appointment = await manager.getRepository(AppointmentEntity)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.id = :appointmentId', { appointmentId: transaction.appointmentId })
        .getOneOrFail();
      const repository = manager.getRepository(RefundRequestEntity);
      const existing = await repository.findOne({
        where: { paymentTransactionId: transaction.id },
      });
      if (existing) return existing;
      transaction.status = PaymentTransactionStatus.LATE_SUCCESS;
      transaction.reconciliationManualReview = false;
      transaction.nextReconcileAt = null;
      transaction.lastReconcileError = 'Administrator determined that a refund is required.';
      appointment.paymentStatus = PaymentStatus.REFUND_PENDING;
      await manager.save([transaction, appointment]);
      return manager.save(repository.create({
        appointmentId: appointment.id,
        paymentTransactionId: transaction.id,
        provider: transaction.provider,
        amount: Number(transaction.amountVnd),
        status: 'PENDING',
        attempts: 0,
        failureReason: null,
        processedAt: null,
        providerRefundId: null,
        processedBy: null,
      }));
    });
    this.audit(adminId, transactionId, outcome);
    return refund;
  }

  private async manualTransaction(transactionId: string): Promise<PaymentTransactionEntity> {
    const transaction = await this.dataSource.getRepository(PaymentTransactionEntity).findOne({
      where: {
        id: transactionId,
        status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
        reconciliationManualReview: true,
      },
    });
    if (!transaction) throw new NotFoundException('Manual-review transaction not found.');
    return transaction;
  }

  private audit(adminId: string, transactionId: string, action: string): void {
    this.logger.log(JSON.stringify({
      event: 'payment.reconciliation.manual',
      adminId,
      transactionId,
      action,
    }));
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
