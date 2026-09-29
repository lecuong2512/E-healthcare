import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentTransactionStatus } from '@shared/enums';
import { PaymentTransactionEntity } from './payment-trans.entity';
import { UserEntity } from './user.entity';

export type PaymentReconciliationAuditAction =
  | 'MARK_FAILED'
  | 'MARK_REFUND_REQUIRED'
  | 'RETRY_PROVIDER_QUERY';

@Entity('payment_reconciliation_audits')
@Index('idx_payment_reconciliation_audits_transaction_created', [
  'paymentTransactionId',
  'createdAt',
])
export class PaymentReconciliationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_transaction_id', type: 'uuid' })
  paymentTransactionId!: string;

  @ManyToOne(() => PaymentTransactionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction!: PaymentTransactionEntity;

  @Column({ name: 'admin_id', type: 'uuid' })
  adminId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_id' })
  admin!: UserEntity;

  @Column({ type: 'varchar', length: 32 })
  action!: PaymentReconciliationAuditAction;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'previous_status', type: 'varchar', length: 32 })
  previousStatus!: PaymentTransactionStatus;

  @Column({ name: 'new_status', type: 'varchar', length: 32 })
  newStatus!: PaymentTransactionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
