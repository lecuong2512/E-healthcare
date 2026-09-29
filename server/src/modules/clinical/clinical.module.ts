import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PdfGeneratorModule } from '../notification/pdf-generator.module';
import { PrescriptionPdfService } from './prescription-pdf.service';

@Module({
  imports: [DatabaseModule, RealtimeModule, PdfGeneratorModule],
  controllers: [ClinicalController],
  providers: [ClinicalService, Icd10Service, PrescriptionPdfService],
  exports: [ClinicalService, Icd10Service],
})
export class ClinicalModule {}

