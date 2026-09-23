import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ClinicalController],
  providers: [ClinicalService, Icd10Service],
  exports: [ClinicalService, Icd10Service],
})
export class ClinicalModule {}

