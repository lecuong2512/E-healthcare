import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@shared/enums';
import { AuditLogItem, AuditLogPage } from '@shared/interfaces';
import { DataSource, EntityManager } from 'typeorm';
import { AuditContext } from '../audit/audit-context';
import { AuditService } from '../audit/audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

interface AuditRow {
  id: string;
  occurred_at: Date;
  actor_id: string | null;
  actor_display_name: string | null;
  actor_role: AuditLogItem['actorRole'];
  action: AuditLogItem['action'];
  outcome: AuditLogItem['outcome'];
  ip_address: string | null;
  user_agent: string | null;
  resource_type: string | null;
  resource_id: string | null;
  request_id: string | null;
}

@Injectable()
export class AdminAuditService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: AuditLogQueryDto,
    context: AuditContext,
  ): Promise<AuditLogPage> {
    return this.dataSource.transaction(async (manager) => {
      const ownEvent = await this.audit.record(manager, context, {
        action: AuditAction.VIEW_AUDIT_LOGS,
        resourceType: 'AUDIT_LOG',
        metadata: { page: query.page, pageSize: query.pageSize },
      });
      return this.queryPage(manager, query, ownEvent.id);
    });
  }

  async exportCsv(
    query: AuditLogQueryDto,
    context: AuditContext,
  ): Promise<Buffer> {
    return this.dataSource.transaction(async (manager) => {
      const ownEvent = await this.audit.record(manager, context, {
        action: AuditAction.EXPORT_AUDIT_LOGS,
        resourceType: 'AUDIT_LOG',
      });
      const exportQuery = Object.assign(new AuditLogQueryDto(), query, {
        page: 1,
        pageSize: 100,
      });
      const conditions = this.conditions(exportQuery, ownEvent.id);
      const countRows = await manager.query(
        `SELECT COUNT(*)::int AS total FROM audit_logs a WHERE ${conditions.sql}`,
        conditions.parameters,
      );
      const total = Number(countRows[0]?.total ?? 0);
      if (total > 10_000) {
        throw new BadRequestException({
          code: 'AUDIT_EXPORT_TOO_LARGE',
          message: 'Bộ lọc vượt quá giới hạn 10.000 bản ghi. Vui lòng thu hẹp khoảng thời gian.',
        });
      }
      const rows: AuditRow[] = await manager.query(
        `SELECT id, occurred_at, actor_id, actor_display_name, actor_role,
                action, outcome, host(ip_address) AS ip_address, user_agent,
                resource_type, resource_id, request_id
           FROM audit_logs a
          WHERE ${conditions.sql}
          ORDER BY occurred_at DESC, id DESC`,
        conditions.parameters,
      );
      return Buffer.from(`\uFEFF${this.toCsv(rows.map((row) => this.mapRow(row)))}`, 'utf8');
    });
  }

  private async queryPage(
    manager: EntityManager,
    query: AuditLogQueryDto,
    excludedId: string,
  ): Promise<AuditLogPage> {
    const conditions = this.conditions(query, excludedId);
    const countRows = await manager.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs a WHERE ${conditions.sql}`,
      conditions.parameters,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const limitIndex = conditions.parameters.length + 1;
    const offsetIndex = conditions.parameters.length + 2;
    const rows: AuditRow[] = await manager.query(
      `SELECT id, occurred_at, actor_id, actor_display_name, actor_role,
              action, outcome, host(ip_address) AS ip_address, user_agent,
              resource_type, resource_id, request_id
         FROM audit_logs a
        WHERE ${conditions.sql}
        ORDER BY occurred_at DESC, id DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      [
        ...conditions.parameters,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ],
    );
    return {
      items: rows.map((row) => this.mapRow(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  private conditions(query: AuditLogQueryDto, excludedId: string) {
    const from = new Date(query.from);
    const toExclusive = new Date(query.toExclusive);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(toExclusive.getTime()) ||
      from >= toExclusive
    ) {
      throw new BadRequestException({
        code: 'INVALID_AUDIT_TIME_RANGE',
        message: 'Khoảng thời gian tra cứu không hợp lệ.',
      });
    }
    if (toExclusive.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        code: 'AUDIT_TIME_RANGE_TOO_LARGE',
        message: 'Mỗi lần chỉ được tra cứu tối đa 366 ngày.',
      });
    }

    const parameters: unknown[] = [from.toISOString(), toExclusive.toISOString(), excludedId];
    const clauses = [
      'a.occurred_at >= $1::timestamptz',
      'a.occurred_at < $2::timestamptz',
      'a.id <> $3::uuid',
    ];
    if (query.action) {
      parameters.push(query.action);
      clauses.push(`a.action = $${parameters.length}`);
    }
    const search = query.search?.trim();
    if (search) {
      parameters.push(search);
      const index = parameters.length;
      clauses.push(`(a.actor_id::text = $${index} OR host(a.ip_address) = $${index})`);
    }
    return { sql: clauses.join(' AND '), parameters };
  }

  private mapRow(row: AuditRow): AuditLogItem {
    return {
      id: row.id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      actorId: row.actor_id,
      actorDisplayName: row.actor_display_name,
      actorRole: row.actor_role,
      action: row.action,
      outcome: row.outcome,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      requestId: row.request_id,
    };
  }

  private toCsv(rows: readonly AuditLogItem[]): string {
    const header = [
      'Thời điểm (UTC+7)',
      'User ID',
      'Tài khoản',
      'Vai trò',
      'Thao tác',
      'Kết quả',
      'Địa chỉ IP',
      'User-Agent',
    ];
    const lines = rows.map((row) => [
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: false,
      }).format(new Date(row.occurredAt)),
      row.actorId,
      row.actorDisplayName,
      row.actorRole,
      row.action,
      row.outcome,
      row.ipAddress,
      row.userAgent,
    ]);
    return [header, ...lines]
      .map((values) => values.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
  }

  private csvCell(value: string | null): string {
    let safe = value ?? '';
    if (/^[=+\-@\t\r]/.test(safe)) {
      safe = `'${safe}`;
    }
    return `"${safe.replace(/"/g, '""')}"`;
  }
}
