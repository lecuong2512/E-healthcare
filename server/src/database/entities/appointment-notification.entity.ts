import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';

export type AppointmentNotificationChannel = 'EMAIL' | 'SMS';
export type AppointmentNotificationStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';

@Entity('appointment_notifications')
export class AppointmentNotificationEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'appointment_id', type: 'uuid' }) appointmentId!: string;
  @ManyToOne(() => AppointmentEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'appointment_id' }) appointment!: AppointmentEntity;
  @Column({ type: 'varchar', length: 8 }) channel!: AppointmentNotificationChannel;
  @Column({ type: 'varchar', length: 255 }) recipient!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) subject!: string | null;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'varchar', length: 16, default: 'PENDING' }) status!: AppointmentNotificationStatus;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ name: 'failure_reason', type: 'text', nullable: true }) failureReason!: string | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
