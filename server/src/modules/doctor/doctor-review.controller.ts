import { Body, Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { CreateDoctorReviewDto } from './dto/create-doctor-review.dto';
import { DoctorReviewService } from './doctor-review.service';

@Controller('doctors')
export class DoctorReviewController {
  constructor(private readonly service: DoctorReviewService) {}

  @Post(':doctorId/reviews')
  @Roles(Role.PATIENT)
  create(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Body() dto: CreateDoctorReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.create(doctorId, request.auth!.userId, dto);
  }
}
