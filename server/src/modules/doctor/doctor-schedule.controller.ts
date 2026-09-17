import { Controller, Post, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { DoctorScheduleService } from './doctor-schedule.service';
import { CreateDoctorScheduleDto } from './dto/create-schedule.dto';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OwnDoctorGuard } from '../../common/guards/own-doctor.guard';
import { Roles } from '../../common/decorators/auth.decorators';
import { OwnDoctor } from '../../common/decorators/own-doctor.decorator';
import { Role } from '@shared/enums';


@Controller('doctors/:doctorId/schedules')
@UseGuards(AccessTokenGuard, RolesGuard, OwnDoctorGuard)
export class DoctorScheduleController {
  constructor(private readonly service: DoctorScheduleService) {}

  @Post()
  @Roles(Role.DOCTOR, Role.ADMIN)
  @OwnDoctor('doctorId')
  create(@Param('doctorId', ParseUUIDPipe) doctorId: string, @Body() dto: CreateDoctorScheduleDto) {
    return this.service.createSchedule(doctorId, dto);
  }
}