import { AuditAction, AuditOutcome, Role } from '../enums';

export interface AuditLogItem {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorId: string | null;
  readonly actorDisplayName: string | null;
  readonly actorRole: Role | null;
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly requestId: string | null;
}

export interface AuditLogPage {
  readonly items: readonly AuditLogItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface AuditLogQuery {
  readonly from: string;
  readonly toExclusive: string;
  readonly action?: AuditAction;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
