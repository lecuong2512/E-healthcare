import { Module } from "@nestjs/common";
import { OwnDoctorGuard } from "../../common/guards/own-doctor.guard";
import { DatabaseModule } from "../../database/database.module";
import { DoctorScheduleController } from "./doctor-schedule.controller";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { DoctorCacheService } from "./doctor-cache.service";
import { DoctorSearchController } from "./doctor-search.controller";
import { DoctorSearchService } from "./doctor-search.service";

@Module({
  imports: [DatabaseModule],
  controllers: [DoctorScheduleController, DoctorSearchController],
  providers: [
    DoctorScheduleService,
    DoctorSearchService,
    DoctorCacheService,
    OwnDoctorGuard,
  ],
})
export class DoctorModule {}
