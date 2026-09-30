import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { StaffAdminController } from './staff-admin.controller';
import { StaffAdminService } from './staff-admin.service';
@Module({ imports: [DatabaseModule], controllers: [StaffAdminController], providers: [StaffAdminService] }) export class StaffAdminModule {}
