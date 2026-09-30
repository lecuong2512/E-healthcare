import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogAdminController } from './admin-catalog.controller';
import { CatalogAdminService } from './admin-catalog.service';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

@Module({
  imports: [DatabaseModule, ClinicalModule, AuditModule],
  controllers: [CatalogAdminController, AdminAuditController],
  providers: [CatalogAdminService, AdminAuditService],
})
export class AdminModule {}
