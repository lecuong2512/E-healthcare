/**
 * Presentation models only. They must not be used as transport DTOs.
 * The future data-access adapter maps shared Audit contracts into these shapes.
 */
export interface AuditLogRowViewModel {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorId: string | null;
  readonly actorDisplayName: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface AuditLogFilterViewModel {
  readonly fromLocal: string;
  readonly toLocal: string;
  readonly action: string;
  readonly search: string;
}

export type AuditLogViewState = 'idle' | 'loading' | 'loaded' | 'error';
export type AuditLogExportState = 'idle' | 'exporting' | 'error';
