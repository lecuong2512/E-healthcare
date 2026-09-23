import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { AppointmentEntity } from './appointment.entity';

@Entity('vouchers')
export class VoucherEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' }) user!: UserEntity;
  @Column({ type: 'varchar', length: 32, unique: true }) code!: string;
  @Column({ name: 'discount_percent', type: 'numeric', precision: 5, scale: 2 }) discountPercent!: number;
  @Column({ name: 'is_used', type: 'boolean', default: false }) isUsed!: boolean;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt!: Date | null;
  @Column({ name: 'issued_for_appointment_id', type: 'uuid', nullable: true }) issuedForAppointmentId!: string | null;
  @ManyToOne(() => AppointmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'issued_for_appointment_id' }) issuedForAppointment!: AppointmentEntity | null;
  @Column({ name: 'redeemed_appointment_id', type: 'uuid', nullable: true }) redeemedAppointmentId!: string | null;
  @ManyToOne(() => AppointmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'redeemed_appointment_id' }) redeemedAppointment!: AppointmentEntity | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
