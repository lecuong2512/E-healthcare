import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ReceptionAuditAction } from '@shared/enums';
import { EntityManager } from 'typeorm';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { ReceptionAuditLogEntity } from '../../database/entities/reception-audit-log.entity';

export interface ReceptionAuditContext {
  actorId: string;
  ip: string | null;
  userAgent: string | null;
}

export function receptionAuditContext(request: AuthenticatedRequest): ReceptionAuditContext {
  if (!request.auth?.userId) throw new UnauthorizedException();
  return {
    actorId: request.auth.userId,
    ip: request.ip?.slice(0, 64) ?? null,
    userAgent: request.headers['user-agent']?.slice(0, 512) ?? null,
  };
}

@Injectable()
export class ReceptionAuditService {
  async record(
    manager: EntityManager,
    context: ReceptionAuditContext,
    action: ReceptionAuditAction,
    appointmentId: string | null,
    patientId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const repository = manager.getRepository(ReceptionAuditLogEntity);
    const log = repository.create({
      actorId: context.actorId,
      appointmentId,
      patientId,
      action,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata,
    });
    await repository.save(log);
  }
}
