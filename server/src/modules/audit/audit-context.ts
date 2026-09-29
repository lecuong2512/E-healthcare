import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@shared/enums';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';

export interface AuditTransportContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

export interface AuditContext extends AuditTransportContext {
  readonly actorId: string | null;
  readonly actorRole: Role | null;
}

function singleHeader(value: string | string[] | undefined): string | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  const trimmed = normalized?.trim();
  return trimmed ? trimmed : null;
}

function safeUserAgent(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 512);
}

const serverRequestIds = new WeakMap<object, string>();

function serverRequestId(request: Request): string {
  const existing = serverRequestIds.get(request);
  if (existing) return existing;
  const generated = randomUUID();
  serverRequestIds.set(request, generated);
  return generated;
}

export function auditContextFromRequest(
  request: AuthenticatedRequest,
): AuditContext {
  if (!request.auth?.userId) {
    throw new UnauthorizedException();
  }
  return {
    actorId: request.auth.userId,
    actorRole: request.auth.role,
    ...auditTransportContextFromRequest(request),
  };
}

export function auditTransportContextFromRequest(
  request: Request,
): AuditTransportContext {
  return {
    ipAddress: request.ip || null,
    userAgent: safeUserAgent(singleHeader(request.headers['user-agent'])),
    // Public clients cannot choose the audit correlation identifier. A trusted
    // reverse proxy may retain its own correlation header in gateway logs.
    requestId: serverRequestId(request),
  };
}
