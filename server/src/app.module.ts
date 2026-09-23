import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./modules/auth/auth.module";
import { BookingModule } from "./modules/booking/booking.module";
import { PhrModule } from "./modules/phr/phr.module";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccessTokenGuard } from "./common/guards/access-token.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { DoctorModule } from "./modules/doctor/doctor.module";
import { ClinicalModule } from "./modules/clinical/clinical.module";
import { QueueModule } from "./modules/queue/queue.module";
import { NotificationModule } from "./modules/notification/notification.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    QueueModule.forRoot(),
    NotificationModule.register(),
    AuthModule,
    DoctorModule,
    BookingModule,
    PhrModule,
    ClinicalModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
  providers: [
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
    AccessTokenGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
