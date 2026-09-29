import { Controller, Get, Param, Patch, Query, Body, Post, Req } from '@nestjs/common';
import { Role, UserStatus } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { StaffAdminService } from './staff-admin.service';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';

@Controller('admin/staff')
@Roles(Role.ADMIN)
export class StaffAdminController {
  constructor(private readonly service: StaffAdminService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: UserStatus) { return this.service.list(search, status); }

  @Post()
  create(@Body() body: Parameters<StaffAdminService['create']>[0]) { return this.service.create(body); }

  @Patch(':userId/status')
  changeStatus(@Param('userId') userId: string, @Body('status') status: UserStatus) { return this.service.changeStatus(userId, status); }

  @Patch(':userId')
  updateProfile(@Param('userId') userId: string, @Body() body: Parameters<StaffAdminService['updateProfile']>[1]) { return this.service.updateProfile(userId, body); }

  @Get('recurring-shifts')
  listRecurringShifts() { return this.service.listRecurringShifts(); }

  @Post('recurring-shifts/:shiftId/approve')
  approveRecurringShift(@Param('shiftId') shiftId: string, @Req() request: AuthenticatedRequest) {
    return this.service.approveRecurringShift(shiftId, request.auth!.userId);
  }
}
