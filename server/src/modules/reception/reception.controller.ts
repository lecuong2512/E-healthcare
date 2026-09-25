import {
  Controller,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@shared/enums';
import {
  AvailableWalkInDoctor,
  CheckInResponse,
  CounterPaymentReceipt,
  ClinicPrintInfo,
  ReceptionAppointment,
  WalkInBookingResponse,
} from '@shared/interfaces';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { CounterPaymentService } from './counter-payment.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { AvailableDoctorsDto } from './dto/available-doctors.dto';
import { LookupAppointmentDto } from './dto/lookup-appointment.dto';
import { WalkInDto } from './dto/walk-in.dto';
import { ReceptionService } from './reception.service';
import { WalkInService } from './walk-in.service';
import { receptionAuditContext } from './reception-audit.service';
import { CheckInQrService } from './check-in-qr.service';
import { CheckInQrDto } from './dto/check-in-qr.dto';
import { clinicPrintProfile } from './clinic-print-profile';

@Controller('reception')
@Roles(Role.RECEPTIONIST)
export class ReceptionController {
  constructor(
    private readonly service: ReceptionService,
    private readonly payments: CounterPaymentService,
    private readonly walkIn: WalkInService,
    private readonly qr: CheckInQrService,
  ) {}

  @Get('clinic-profile')
  getClinicProfile(): ClinicPrintInfo {
    return clinicPrintProfile();
  }

  @Get('appointments/lookup')
  lookup(
    @Query() query: LookupAppointmentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReceptionAppointment[]> {
    return this.service.lookup(query, receptionAuditContext(request));
  }

  @Post('qr/lookup')
  @HttpCode(HttpStatus.OK)
  lookupByQr(
    @Body() dto: CheckInQrDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReceptionAppointment> {
    return this.qr.lookup(dto.qrToken, receptionAuditContext(request));
  }

  @Post('qr/check-in')
  checkInByQr(
    @Body() dto: CheckInQrDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CheckInResponse> {
    return this.qr.checkIn(dto.qrToken, receptionAuditContext(request));
  }

  @Post('appointments/:appointmentId/check-in')
  checkIn(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CheckInResponse> {
    return this.service.checkIn(appointmentId, receptionAuditContext(request));
  }

  @Post('appointments/:appointmentId/collect-payment')
  collectPayment(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: CollectPaymentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CounterPaymentReceipt> {
    return this.payments.collect(appointmentId, receptionAuditContext(request), dto);
  }

  @Get('appointments/:appointmentId/receipt')
  getReceipt(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CounterPaymentReceipt> {
    return this.payments.reprintReceipt(appointmentId, receptionAuditContext(request));
  }

  @Get('walk-in/doctors')
  availableDoctors(
    @Query() query: AvailableDoctorsDto,
  ): Promise<AvailableWalkInDoctor[]> {
    return this.walkIn.availableDoctors(query);
  }

  @Post('walk-in')
  bookWalkIn(
    @Body() dto: WalkInDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<WalkInBookingResponse> {
    return this.walkIn.book(dto, receptionAuditContext(request), idempotencyKey);
  }
}
