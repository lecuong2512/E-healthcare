import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
import { CancelAppointmentDto, UpdateAppointmentStatusDto } from './dto';
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly lifecycle: AppointmentLifecycleService) {}
  @Get('me') @Roles(Role.PATIENT) listMine(@Req() req: AuthenticatedRequest) { return this.lifecycle.listForPatient(req.auth!.userId); }
  @Get('me/vouchers') @Roles(Role.PATIENT) listVouchers(@Req() req: AuthenticatedRequest) { return this.lifecycle.listVouchers(req.auth!.userId); }
  @Get('vouchers/validate') @Roles(Role.PATIENT) validateVoucher(@Query('code') code: string, @Query('totalAmount') totalAmount: string, @Req() req: AuthenticatedRequest) { return this.lifecycle.validateVoucher(req.auth!.userId, code || '', Number(totalAmount)); }
  @Post(':id/cancel') @Roles(Role.PATIENT) cancelMine(@Param('id') id: string, @Body() dto: CancelAppointmentDto, @Req() req: AuthenticatedRequest) { return this.lifecycle.cancelByPatient(id, req.auth!, dto.reason, dto.consentAccepted); }
  @Post(':id/cancel-by-clinic') @Roles(Role.DOCTOR, Role.ADMIN) cancelByClinic(@Param('id') id: string, @Body() dto: CancelAppointmentDto, @Req() req: AuthenticatedRequest) { return this.lifecycle.cancelByClinic(id, req.auth!, dto.reason); }
  @Patch(':id/status') @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN) updateStatus(@Param('id') id: string, @Body() dto: UpdateAppointmentStatusDto, @Req() req: AuthenticatedRequest) { return this.lifecycle.transition(id, dto.status, req.auth!); }
}
