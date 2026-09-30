import { Module } from "@nestjs/common";
import { OwnDoctorGuard } from "../../common/guards/own-doctor.guard";
import { DatabaseModule } from "../../database/database.module";
import {
  ClinicRoomPublicController,
  DoctorScheduleController,
  DoctorSelfScheduleController,
} from "./doctor-schedule.controller";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { DoctorCacheService } from "./doctor-cache.service";
import { DoctorSearchController } from "./doctor-search.controller";
import { DoctorSearchService } from "./doctor-search.service";
import { DoctorReviewController } from "./doctor-review.controller";
import { DoctorReviewService } from "./doctor-review.service";

@Module({
  imports: [DatabaseModule],
  controllers: [
    DoctorScheduleController,
    DoctorSelfScheduleController,
    ClinicRoomPublicController,
    DoctorSearchController,
    DoctorReviewController,
  ],
  providers: [
    DoctorScheduleService,
    DoctorSearchService,
    DoctorCacheService,
    DoctorReviewService,
    OwnDoctorGuard,
  ],
  exports: [DoctorScheduleService],
})
export class DoctorModule {}
