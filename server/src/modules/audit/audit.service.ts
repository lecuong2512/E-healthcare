import { Injectable } from '@nestjs/common';
import { AuditAction, AuditOutcome } from '@shared/enums';
import { EntityManager } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { AuditContext } from './audit-context';

export interface AuditEvent {
  readonly action: AuditAction;
  readonly outcome?: AuditOutcome;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly metadata?: Record<string, string | number | boolean | null>;
}

const AUDIT_METADATA_ALLOWLIST: Partial<
  Record<AuditAction, ReadonlySet<string>>
> = {
  [AuditAction.LOGIN]: new Set(['reason']),
  [AuditAction.LOGIN_FAILED]: new Set(['reason']),
  [AuditAction.CREATE_EMR]: new Set(['hasPrescription']),
  [AuditAction.VIEW_EMR]: new Set(['view']),
  [AuditAction.UPDATE_EMR]: new Set(['operation']),
  [AuditAction.UPDATE_RX]: new Set(['operation']),
  [AuditAction.CREATE_EMR_ADDENDUM]: new Set(['addendumId']),
  [AuditAction.CANCEL_APPT]: new Set([
    'status',
    'refundPercent',
    'refundAmount',
  ]),
  [AuditAction.VIEW_AUDIT_LOGS]: new Set(['page', 'pageSize']),
};

const FORBIDDEN_METADATA_KEY =
  /(clinical|vital|prescription|medicine|diagnos|token|cookie|secret|password|payload|body)/i;

@Injectable()
export class AuditService {
  async record(
    manager: EntityManager,
    context: AuditContext,
    event: AuditEvent,
  ): Promise<AuditLogEntity> {
    const actor = context.actorId
      ? await manager.getRepository(UserEntity).findOne({
          where: { id: context.actorId },
          select: { id: true, fullName: true },
        })
      : null;

    const log = manager.getRepository(AuditLogEntity).create({
      actorId: context.actorId,
      actorDisplayName: actor?.fullName ?? null,
      actorRole: context.actorRole,
      action: event.action,
      outcome: event.outcome ?? AuditOutcome.SUCCESS,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: event.resourceType?.slice(0, 64) ?? null,
      resourceId: event.resourceId?.slice(0, 128) ?? null,
      metadata: this.sanitizeMetadata(event.action, event.metadata),
    });
    return manager.getRepository(AuditLogEntity).save(log);
  }

  private sanitizeMetadata(
    action: AuditAction,
    metadata: AuditEvent['metadata'],
  ): Record<string, string | number | boolean | null> {
    if (!metadata) return {};
    const allowed = AUDIT_METADATA_ALLOWLIST[action] ?? new Set<string>();
    const sanitized: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (FORBIDDEN_METADATA_KEY.test(key) || !allowed.has(key)) {
        throw new Error(`Audit metadata field is not allowed for ${action}: ${key}`);
      }
      if (typeof value === 'string') {
        if (value.length > 256 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
          throw new Error(`Audit metadata value is invalid for ${action}: ${key}`);
        }
        sanitized[key] = value;
      } else if (
        value === null ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        sanitized[key] = value;
      } else {
        throw new Error(`Audit metadata value is invalid for ${action}: ${key}`);
      }
    }
    return sanitized;
  }
}
