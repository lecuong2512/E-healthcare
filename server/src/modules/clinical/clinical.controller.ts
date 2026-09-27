import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  SearchIcd10Dto,
  PrescriptionSafetyCheckDto,
  CreateEmrAddendumDto,
} from './dto';

@Controller('clinical')
export class ClinicalController {
  constructor(
    private readonly clinicalService: ClinicalService,
    private readonly icd10Service: Icd10Service,
  ) {}

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
    return this.clinicalService.createMedicalRecord(req.auth!.userId, dto);
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
    );
  }

  /**
   * Get Medical Record by ID.
   */
  @Get('medical-records/:id')
  @Roles(Role.DOCTOR, Role.PATIENT, Role.ADMIN)
  async getMedicalRecord(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) recordId: string,
  ) {
    return this.clinicalService.getMedicalRecord(
      req.auth!.userId,
      req.auth!.role,
      recordId,
    );
  }

  /**
   * Get Medical Record by Appointment ID.
   */
  @Get('medical-records/appointment/:appointmentId')
  @Roles(Role.DOCTOR, Role.PATIENT, Role.ADMIN)
  async getMedicalRecordByAppointment(
    @Req() req: AuthenticatedRequest,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.clinicalService.getMedicalRecordByAppointment(
      req.auth!.userId,
      req.auth!.role,
      appointmentId,
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
    );
  }
}
