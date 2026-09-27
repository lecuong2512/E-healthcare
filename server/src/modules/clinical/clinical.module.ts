import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [DatabaseModule, RealtimeModule],
  controllers: [ClinicalController],
  providers: [ClinicalService, Icd10Service],
  exports: [ClinicalService, Icd10Service],
})
export class ClinicalModule {}

