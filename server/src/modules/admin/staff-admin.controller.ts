import { Controller, Get, Param, Patch, Query, Body, Post } from '@nestjs/common';
import { Role, UserStatus } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { StaffAdminService } from './staff-admin.service';
@Controller('api/v1/admin/staff') @Roles(Role.ADMIN)
export class StaffAdminController { constructor(private readonly service: StaffAdminService) {} @Get() list(@Query('search') search?: string, @Query('status') status?: UserStatus) { return this.service.list(search, status); } @Post() create(@Body() body: Parameters<StaffAdminService['create']>[0]) { return this.service.create(body); } @Patch(':userId/status') changeStatus(@Param('userId') userId: string, @Body('status') status: UserStatus) { return this.service.changeStatus(userId, status); } }
