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

  @Get('rooms')
  listRooms() { return this.service.listRooms(); }

  @Get('room-catalog')
  listRoomCatalog() { return this.service.listRoomCatalog(); }

  @Post('room-catalog')
  createRoom(@Body() body: { roomNumber: string; roomName?: string; specialtyId?: string; roomType?: string; location?: string; notes?: string }) { return this.service.createRoom(body); }

  @Patch('room-catalog/:roomId')
  updateRoom(@Param('roomId') roomId: string, @Body() body: { roomName?: string; specialtyId?: string; roomType?: string; location?: string; notes?: string; isActive?: boolean }) { return this.service.updateRoom(roomId, body); }

  @Post()
  create(@Body() body: Parameters<StaffAdminService['create']>[0]) { return this.service.create(body); }

  @Get('recurring-shifts')
  listRecurringShifts() { return this.service.listRecurringShifts(); }

  @Post('shift-assignments')
  createShiftAssignment(@Body() body: Parameters<StaffAdminService['createShiftAssignment']>[0]) { return this.service.createShiftAssignment(body); }

  @Patch('shift-assignments/:shiftId')
  updateShiftAssignment(@Param('shiftId') shiftId: string, @Body() body: Parameters<StaffAdminService['updateShiftAssignment']>[1]) { return this.service.updateShiftAssignment(shiftId, body); }

  @Patch(':userId/status')
  changeStatus(@Param('userId') userId: string, @Body('status') status: UserStatus, @Req() request: AuthenticatedRequest) {
    return this.service.changeStatus(userId, status, request.auth?.userId);
  }

  @Patch(':userId')
  updateProfile(@Param('userId') userId: string, @Body() body: Parameters<StaffAdminService['updateProfile']>[1]) { return this.service.updateProfile(userId, body); }

  @Post('recurring-shifts/:shiftId/approve')
  approveRecurringShift(@Param('shiftId') shiftId: string, @Req() request: AuthenticatedRequest) {
    return this.service.approveRecurringShift(shiftId, request.auth!.userId);
  }
}
