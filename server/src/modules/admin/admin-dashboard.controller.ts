import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@Roles(Role.ADMIN)
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}
  @Get('overview') overview(@Query('days') days?: string) { return this.service.overview(Number(days) || 7); }
  @Post('approve') approve(@Body('days') days: number, @Req() request: AuthenticatedRequest) { return this.service.approval(days || 7, request.auth!.userId); }
  @Get('export/csv') async csv(@Query('days') days: string, @Res() response: Response) { const kpi = await this.service.overview(Number(days) || 7); response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="ehealth-kpi.csv"'); response.send(`Chỉ số,Giá trị\nTổng lượt khám,${kpi.visits}\nTổng doanh thu,${kpi.revenue}\nTỷ lệ hoàn thành,${kpi.completionRate}%\nNo-show,${kpi.noShowRate}%\nTỷ lệ hủy,${kpi.cancellationRate}%`); }
  @Get('export/pdf') async pdf(@Query('days') days: string, @Res() response: Response) { response.setHeader('Content-Type', 'application/pdf'); response.setHeader('Content-Disposition', 'attachment; filename="ehealth-kpi.pdf"'); response.send(await this.service.exportPdf(Number(days) || 7)); }
}
