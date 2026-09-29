import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { CatalogAdminController } from './admin-catalog.controller';
import { CatalogAdminService } from './admin-catalog.service';

@Module({ imports: [DatabaseModule, ClinicalModule], controllers: [CatalogAdminController], providers: [CatalogAdminService] })
export class AdminModule {}
