import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@shared/enums';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { auditContextFromRequest } from '../audit/audit-context';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';
import { PrescriptionPdfService } from './prescription-pdf.service';
import {
  CreateEmrAddendumDto,
  CreateMedicalRecordDto,
  PrescriptionSafetyCheckDto,
  SearchIcd10Dto,
  UpdateMedicalRecordDto,
} from './dto';

@Controller('clinical')
export class ClinicalController {
  constructor(
    private readonly clinicalService: ClinicalService,
    private readonly icd10Service: Icd10Service,
    private readonly prescriptionPdf: PrescriptionPdfService,
  ) {}

  @Get('appointments/:appointmentId/prescription.pdf')
  @Roles(Role.PATIENT)
  @Header('Cache-Control', 'private, no-store')
  async downloadPrescriptionPdf(
    @Req() req: AuthenticatedRequest,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ): Promise<StreamableFile> {
    const result = await this.prescriptionPdf.generateForPatient(
      appointmentId,
      req.auth!.userId,
      auditContextFromRequest(req),
    );
    const safeCode = result.prescriptionCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    return new StreamableFile(result.buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${safeCode}.pdf"`,
    });
  }

  @Get('prescriptions/:prescriptionCode/verify')
  @Public()
  @Header('Cache-Control', 'no-store')
  verifyPrescription(
    @Param('prescriptionCode') prescriptionCode: string,
    @Query('hash') hash?: string,
  ): Promise<{ valid: boolean }> {
    return this.prescriptionPdf.verify(prescriptionCode, hash);
  }

  /**
   * Search ICD-10 catalog by code or Vietnamese disease name.
   */
  @Get('icd10/search')
  @Roles(Role.DOCTOR, Role.ADMIN)
  async searchIcd10(@Query() queryDto: SearchIcd10Dto) {
    return this.icd10Service.search(queryDto.q || '', queryDto.limit);
  }

  /**
   * Check drug allergies and chronic disease constraints before saving prescription.
   */
  @Post('prescriptions/safety-check')
  @Roles(Role.DOCTOR)
  async checkPrescriptionSafety(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PrescriptionSafetyCheckDto,
  ) {
    return this.clinicalService.checkPrescriptionSafetyEndpoint(
      req.auth!.userId,
      dto,
    );
  }


  /**
   * Create / Save Draft Medical Record (EMR).
   */
  @Post('medical-records')
  @Roles(Role.DOCTOR)
  async createMedicalRecord(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMedicalRecordDto,
  ) {
    return this.clinicalService.createMedicalRecord(
      req.auth!.userId,
      dto,
      auditContextFromRequest(req),
    );
  }

  /**
   * Update Draft or Within-24h Medical Record.
   */
  @Patch('medical-records/:id')
  @Roles(Role.DOCTOR)
  async updateMedicalRecord(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) recordId: string,
    @Body() dto: UpdateMedicalRecordDto,
  ) {
    return this.clinicalService.updateMedicalRecord(
      req.auth!.userId,
      recordId,
      dto,
      auditContextFromRequest(req),
    );
  }

  /**
   * Complete Consultation & make EMR effective (starts 24h countdown).
   */
  @Post('medical-records/:id/complete')
  @Roles(Role.DOCTOR)
  async completeConsultation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) recordId: string,
  ) {
    return this.clinicalService.completeConsultation(
      req.auth!.userId,
      recordId,
      auditContextFromRequest(req),
    );
  }

  /**
   * Get Medical Record by ID.
   */
  @Get('medical-records/:id')
  @Roles(Role.DOCTOR, Role.PATIENT)
  async getMedicalRecord(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) recordId: string,
  ) {
    return this.clinicalService.getMedicalRecord(
      req.auth!.userId,
      req.auth!.role,
      recordId,
      auditContextFromRequest(req),
    );
  }

  /**
   * Get Medical Record by Appointment ID.
   */
  @Get('medical-records/appointment/:appointmentId')
  @Roles(Role.DOCTOR, Role.PATIENT)
  async getMedicalRecordByAppointment(
    @Req() req: AuthenticatedRequest,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.clinicalService.getMedicalRecordByAppointment(
      req.auth!.userId,
      req.auth!.role,
      appointmentId,
      auditContextFromRequest(req),
    );
  }

  /**
   * Create EMR Addendum after 24h lock.
   */
  @Post('records/:id/addendums')
  @Roles(Role.DOCTOR)
  async createEmrAddendum(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) recordId: string,
    @Body() dto: CreateEmrAddendumDto,
  ) {
    return this.clinicalService.createEmrAddendum(
      req.auth!.userId,
      recordId,
      dto,
      auditContextFromRequest(req),
    );
  }

  /**
   * Get EMR clinical history and addendums timeline.
   */
  @Get('records/:id/history')
  @Roles(Role.DOCTOR, Role.PATIENT)
  async getEmrHistory(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) recordId: string,
  ) {
    return this.clinicalService.getEmrHistory(
      req.auth!.userId,
      req.auth!.role,
      recordId,
      auditContextFromRequest(req),
    );
  }
}
