import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { auditContextFromRequest } from '../audit/audit-context';
import { AdminAuditService } from './admin-audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Controller('admin/audit-logs')
@Roles(Role.ADMIN)
export class AdminAuditController {
  constructor(private readonly auditLogs: AdminAuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Query() query: AuditLogQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auditLogs.list(query, auditContextFromRequest(request));
  }

  @Get('export')
  async export(
    @Query() query: AuditLogQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.auditLogs.exportCsv(
      query,
      auditContextFromRequest(request),
    );
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-logs-${date}.csv"`,
    );
    response.send(csv);
  }
}
