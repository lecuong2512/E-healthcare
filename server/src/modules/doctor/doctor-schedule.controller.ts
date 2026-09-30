import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { Role } from "@shared/enums";
import { Public, Roles } from "../../common/decorators/auth.decorators";
import { OwnDoctor } from "../../common/decorators/own-doctor.decorator";
import { OwnDoctorGuard } from "../../common/guards/own-doctor.guard";
import { AuthenticatedRequest } from "../../common/guards/authenticated-request";
import { DoctorEntity } from "../../database/entities/doctor.entity";
import { ClinicRoomEntity } from "../../database/entities/clinic-room.entity";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { CreateDoctorScheduleDto } from "./dto/create-schedule.dto";
import { ScheduleRangeDto } from "./dto/schedule-range.dto";
import { UpdateDoctorScheduleDto } from "./dto/update-schedule.dto";

@Controller("doctors/:doctorId/schedules")
@UseGuards(OwnDoctorGuard)
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

@Controller("doctor/schedules")
@Roles(Role.DOCTOR)
export class DoctorSelfScheduleController {
  constructor(
    private readonly service: DoctorScheduleService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async getMySchedules(
    @Req() req: AuthenticatedRequest,
    @Query() range: ScheduleRangeDto,
  ) {
    const doctor = await this.findDoctorByUserId(req.auth?.userId);
    return this.service.getSchedules(doctor.id, range);
  }

  @Post()
  async createSchedule(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDoctorScheduleDto,
  ) {
    const doctor = await this.findDoctorByUserId(req.auth?.userId);
    return this.service.createSchedule(doctor.id, dto);
  }

  @Delete(":scheduleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSchedule(
    @Req() req: AuthenticatedRequest,
    @Param("scheduleId", ParseUUIDPipe) scheduleId: string,
  ) {
    const doctor = await this.findDoctorByUserId(req.auth?.userId);
    return this.service.deleteSchedule(doctor.id, scheduleId);
  }

  @Get("rooms")
  async getRooms() {
    const rooms = await this.dataSource.getRepository(ClinicRoomEntity).find({
      where: { isActive: true },
      order: { roomNumber: 'ASC' },
    });
    return rooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomName: r.roomName || `Phòng khám ${r.roomNumber}`,
      location: r.location,
    }));
  }

  private async findDoctorByUserId(userId?: string): Promise<DoctorEntity> {
    if (!userId) {
      throw new UnauthorizedException("Chưa đăng nhập.");
    }
    const doctor = await this.dataSource
      .getRepository(DoctorEntity)
      .findOneBy({ userId });
    if (!doctor) {
      throw new NotFoundException("Không tìm thấy thông tin bác sĩ.");
    }
    return doctor;
  }
}

@Controller("clinic-rooms")
@Public()
export class ClinicRoomPublicController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async getRooms() {
    const rooms = await this.dataSource.getRepository(ClinicRoomEntity).find({
      where: { isActive: true },
      order: { roomNumber: 'ASC' },
    });
    return rooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomName: r.roomName || `Phòng khám ${r.roomNumber}`,
      location: r.location,
    }));
  }
}

