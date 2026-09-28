import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethod, PaymentTransactionStatus } from '@shared/enums';
import { AppointmentEntity } from './appointment.entity';
import { UserEntity } from './user.entity';

@Entity('payment_transactions')
@Index('idx_payment_transactions_appointment_id', ['appointmentId'])
@Index('idx_payment_transactions_status_expires_at', ['status', 'expiresAt'])
@Index('uq_payment_transactions_provider_merchant', [
  'provider',
  'merchantTransactionId',
], { unique: true })
export class PaymentTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @ManyToOne(() => AppointmentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

  @Column({ name: 'reservation_id', type: 'uuid' })
  reservationId!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient!: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  provider!: PaymentMethod;

  @Column({ name: 'merchant_transaction_id', type: 'varchar', length: 64 })
  merchantTransactionId!: string;

  @Column({ name: 'provider_transaction_id', type: 'varchar', length: 100, nullable: true })
  providerTransactionId!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @Column({ name: 'amount_vnd', type: 'numeric', precision: 15, scale: 0 })
  amountVnd!: number;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency!: 'VND';

  @Column({ type: 'varchar', length: 32 })
  status!: PaymentTransactionStatus;

  @Column({ name: 'response_code', type: 'varchar', length: 32, nullable: true })
  responseCode!: string | null;

  @Column({ name: 'provider_status', type: 'varchar', length: 64, nullable: true })
  providerStatus!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'callback_received_at', type: 'timestamptz', nullable: true })
  callbackReceivedAt!: Date | null;

  @Column({ name: 'signature_verified', type: 'boolean', default: false })
  signatureVerified!: boolean;

  @Column({ name: 'sanitized_provider_payload', type: 'jsonb', nullable: true })
  sanitizedProviderPayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
