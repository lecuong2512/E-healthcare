import { Controller, Get, Header, Param, ParseUUIDPipe, Req, UnauthorizedException } from '@nestjs/common';
import { Role } from '@shared/enums';
import { CheckInQrResponse } from '@shared/interfaces';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { CheckInQrService } from './check-in-qr.service';

@Controller('appointments')
@Roles(Role.PATIENT)
export class PatientCheckInQrController {
  constructor(private readonly qr: CheckInQrService) {}

  @Get(':appointmentId/check-in-qr')
  @Header('Cache-Control', 'no-store')
  issue(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CheckInQrResponse> {
    if (!request.auth?.userId) throw new UnauthorizedException();
    return this.qr.issue(appointmentId, request.auth.userId);
  }
}
