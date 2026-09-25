import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CounterPaymentMethod, CounterPaymentStatus } from '@shared/enums';
import { AppointmentEntity } from './appointment.entity';
import { UserEntity } from './user.entity';

@Entity('counter_payment_transactions')
export class CounterPaymentTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @ManyToOne(() => AppointmentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

  @Column({ name: 'transaction_code', type: 'varchar', length: 40 })
  transactionCode!: string;

  @Column({ name: 'receipt_code', type: 'varchar', length: 40 })
  receiptCode!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: 'amount_tendered', type: 'numeric', precision: 12, scale: 2 })
  amountTendered!: string;

  @Column({ name: 'change_amount', type: 'numeric', precision: 12, scale: 2 })
  changeAmount!: string;

  @Column({ type: 'varchar', length: 20 })
  method!: CounterPaymentMethod;

  @Column({ type: 'varchar', length: 20 })
  status!: CounterPaymentStatus;

  @Column({ name: 'collected_by', type: 'uuid' })
  collectedBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collected_by' })
  collector!: UserEntity;

  @Column({ name: 'appointment_code', type: 'varchar', length: 20 })
  appointmentCode!: string;

  @Column({ name: 'patient_name', type: 'varchar', length: 100 })
  patientName!: string;

  @Column({ name: 'doctor_name', type: 'varchar', length: 100 })
  doctorName!: string;

  @Column({ name: 'collector_name', type: 'varchar', length: 100 })
  collectorName!: string;

  @Column({ name: 'paid_at', type: 'timestamptz' })
  paidAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
