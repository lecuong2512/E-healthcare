import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction, AuditOutcome, Role } from '@shared/enums';

@Entity('audit_logs')
@Index('idx_audit_logs_occurred_id', ['occurredAt', 'id'])
@Index('idx_audit_logs_actor_occurred', ['actorId', 'occurredAt'])
@Index('idx_audit_logs_action_occurred', ['action', 'occurredAt'])
@Index('idx_audit_logs_ip_occurred', ['ipAddress', 'occurredAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_display_name', type: 'varchar', length: 100, nullable: true })
  actorDisplayName!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 32, nullable: true })
  actorRole!: Role | null;

  @Column({ type: 'varchar', length: 64 })
  action!: AuditAction;

  @Column({ type: 'varchar', length: 16, default: AuditOutcome.SUCCESS })
  outcome!: AuditOutcome;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'resource_type', type: 'varchar', length: 64, nullable: true })
  resourceType!: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 128, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, string | number | boolean | null>;
}
