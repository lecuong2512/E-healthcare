import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./modules/auth/auth.module";
import { BookingModule } from "./modules/booking/booking.module";
import { PhrModule } from "./modules/phr/phr.module";
import { AppointmentModule } from "./modules/appointment/appointment.module";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppThrottlerGuard } from "./common/guards/app-throttler.guard";
import { AccessTokenGuard } from "./common/guards/access-token.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { DoctorModule } from "./modules/doctor/doctor.module";
import { ClinicalModule } from "./modules/clinical/clinical.module";
import { QueueModule } from "./modules/queue/queue.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { ReceptionModule } from "./modules/reception/reception.module";
import { StaffAdminModule } from './modules/admin/staff-admin.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminDashboardModule } from './modules/admin/admin-dashboard.module';
import { PaymentModule } from "./modules/payment/payment.module";
import { UserModule } from "./modules/user/user.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    QueueModule.forRoot(),
    NotificationModule.register(),
    AuthModule,
    UserModule,
    DoctorModule,
    BookingModule,
    PhrModule,
    AppointmentModule,
    ClinicalModule,
    ReceptionModule,
    StaffAdminModule,
    AdminModule,
    AdminDashboardModule,
    PaymentModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
  providers: [
    AppThrottlerGuard,
    { provide: ThrottlerGuard, useExisting: AppThrottlerGuard },
    { provide: APP_GUARD, useExisting: AppThrottlerGuard },
    AccessTokenGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
