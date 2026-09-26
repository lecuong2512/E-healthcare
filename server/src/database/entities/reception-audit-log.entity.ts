import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ReceptionAuditAction } from '@shared/enums';

@Entity('reception_audit_logs')
export class ReceptionAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  action!: ReceptionAuditAction;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;
}
