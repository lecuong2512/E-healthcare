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

export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers?.['x-forwarded-for'];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = raw?.split(',')?.[0]?.trim();
    if (clientIp) return normalizeIp(clientIp);
  }
  const realIp = request.headers?.['x-real-ip'];
  if (realIp) {
    const raw = Array.isArray(realIp) ? realIp[0] : realIp;
    const clientIp = raw?.trim();
    if (clientIp) return normalizeIp(clientIp);
  }
  const direct = request.ip || request.socket?.remoteAddress;
  return direct ? normalizeIp(direct) : null;
}

export function auditTransportContextFromRequest(
  request: Request,
): AuditTransportContext {
  return {
    ipAddress: extractClientIp(request),
    userAgent: safeUserAgent(singleHeader(request.headers['user-agent'])),
    // Public clients cannot choose the audit correlation identifier. A trusted
    // reverse proxy may retain its own correlation header in gateway logs.
    requestId: serverRequestId(request),
  };
}
