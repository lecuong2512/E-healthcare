import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName, JobName } from '@shared/enums';
import {
  PrescriptionPdfPayload,
  MedicalRecordPdfPayload,
} from '@shared/interfaces';
import { PdfGeneratorService } from '../services/pdf-generator.service';

@Processor(QueueName.PDF)
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(private readonly pdfGeneratorService: PdfGeneratorService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing PDF job: ${job.name} [ID: ${job.id}]`);

    switch (job.name) {
      case JobName.PDF_GENERATE_PRESCRIPTION: {
        const payload = job.data as PrescriptionPdfPayload;
        const pdfBuffer = await this.pdfGeneratorService.generatePrescriptionPdf(payload);
        return {
          success: true,
          prescriptionCode: payload.prescriptionCode,
          byteLength: pdfBuffer.length,
          base64: pdfBuffer.toString('base64'),
        };
      }

      case JobName.PDF_GENERATE_EMR: {
        const payload = job.data as MedicalRecordPdfPayload;
        const pdfBuffer = await this.pdfGeneratorService.generateEmrPdf(payload);
        return {
          success: true,
          recordCode: payload.recordCode,
          byteLength: pdfBuffer.length,
          base64: pdfBuffer.toString('base64'),
        };
      }

      default:
        this.logger.warn(`Unknown job name in ${QueueName.PDF}: ${job.name}`);
        return { success: false, reason: 'UNKNOWN_JOB_NAME' };
    }
  }
}
