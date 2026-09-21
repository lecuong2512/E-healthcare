import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@shared/enums';
import { CheckInResponse, ReceptionAppointment } from '@shared/interfaces';
import { Roles } from '../../common/decorators/auth.decorators';
import { LookupAppointmentDto } from './dto/lookup-appointment.dto';
import { ReceptionService } from './reception.service';

@Controller('reception')
@Roles(Role.RECEPTIONIST)
export class ReceptionController {
  constructor(private readonly service: ReceptionService) {}

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
}
