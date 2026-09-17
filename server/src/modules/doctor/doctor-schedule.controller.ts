import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@shared/enums";
import { Roles } from "../../common/decorators/auth.decorators";
import { OwnDoctor } from "../../common/decorators/own-doctor.decorator";
import { AccessTokenGuard } from "../../common/guards/access-token.guard";
import { OwnDoctorGuard } from "../../common/guards/own-doctor.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { CreateDoctorScheduleDto } from "./dto/create-schedule.dto";
import { ScheduleRangeDto } from "./dto/schedule-range.dto";
import { UpdateDoctorScheduleDto } from "./dto/update-schedule.dto";

@Controller("doctors/:doctorId/schedules")
@UseGuards(AccessTokenGuard, RolesGuard, OwnDoctorGuard)
@OwnDoctor("doctorId")
export class DoctorScheduleController {
  constructor(private readonly service: DoctorScheduleService) {}

  @Post()
  @Roles(Role.DOCTOR, Role.ADMIN)
  create(
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Body() dto: CreateDoctorScheduleDto,
  ) {
    return this.service.createSchedule(doctorId, dto);
  }

  @Get()
  @Roles(Role.DOCTOR, Role.ADMIN, Role.RECEPTIONIST)
  findAll(
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Query() range: ScheduleRangeDto,
  ) {
    return this.service.getSchedules(doctorId, range);
  }

  @Patch(":scheduleId")
  @Roles(Role.DOCTOR, Role.ADMIN)
  update(
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Param("scheduleId", ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateDoctorScheduleDto,
  ) {
    return this.service.updateSchedule(doctorId, scheduleId, dto);
  }

  @Delete(":scheduleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.DOCTOR, Role.ADMIN)
  remove(
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Param("scheduleId", ParseUUIDPipe) scheduleId: string,
  ) {
    return this.service.deleteSchedule(doctorId, scheduleId);
  }
}
