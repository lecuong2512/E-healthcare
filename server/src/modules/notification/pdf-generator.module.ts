import { Module } from '@nestjs/common';
import { PdfGeneratorService } from './services/pdf-generator.service';

@Module({
  providers: [PdfGeneratorService],
  exports: [PdfGeneratorService],
})
export class PdfGeneratorModule {}
