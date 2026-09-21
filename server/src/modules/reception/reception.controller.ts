import {
  Controller,
  Body,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@shared/enums';
import { CheckInResponse, CounterPaymentReceipt, ReceptionAppointment } from '@shared/interfaces';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { CounterPaymentService } from './counter-payment.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { LookupAppointmentDto } from './dto/lookup-appointment.dto';
import { ReceptionService } from './reception.service';

@Controller('reception')
@Roles(Role.RECEPTIONIST)
export class ReceptionController {
  constructor(
    private readonly service: ReceptionService,
    private readonly payments: CounterPaymentService,
  ) {}

  @Get('appointments/lookup')
  lookup(@Query() query: LookupAppointmentDto): Promise<ReceptionAppointment[]> {
    return this.service.lookup(query);
  }

  @Post('appointments/:appointmentId/check-in')
  checkIn(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ): Promise<CheckInResponse> {
    return this.service.checkIn(appointmentId);
  }

  @Post('appointments/:appointmentId/collect-payment')
  collectPayment(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: CollectPaymentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CounterPaymentReceipt> {
    return this.payments.collect(appointmentId, request.auth?.userId, dto);
  }

  @Get('appointments/:appointmentId/receipt')
  getReceipt(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ): Promise<CounterPaymentReceipt> {
    return this.payments.getReceipt(appointmentId);
  }
}
