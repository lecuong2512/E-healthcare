import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';

export type RefundRequestStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

@Entity('refund_requests')
export class RefundRequestEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'appointment_id', type: 'uuid', unique: true }) appointmentId!: string;
  @ManyToOne(() => AppointmentEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'appointment_id' }) appointment!: AppointmentEntity;
  @Column({ type: 'varchar', length: 20 }) provider!: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount!: number;
  @Column({ type: 'varchar', length: 16, default: 'PENDING' }) status!: RefundRequestStatus;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ name: 'failure_reason', type: 'text', nullable: true }) failureReason!: string | null;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
