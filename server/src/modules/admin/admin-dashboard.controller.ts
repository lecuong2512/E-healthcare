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
  @Get('export/xlsx') async xlsx(@Query('days') days: string, @Res() response: Response) { response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', 'attachment; filename="ehealth-kpi.xlsx"'); response.send(await this.service.exportXlsx(Number(days) || 7)); }
  @Get('export/pdf') async pdf(@Query('days') days: string, @Res() response: Response) { response.setHeader('Content-Type', 'application/pdf'); response.setHeader('Content-Disposition', 'attachment; filename="ehealth-kpi.pdf"'); response.send(await this.service.exportPdf(Number(days) || 7)); }
}
