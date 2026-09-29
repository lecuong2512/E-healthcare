import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AdminAuditController],
  providers: [AdminAuditService],
})
export class AdminModule {}
