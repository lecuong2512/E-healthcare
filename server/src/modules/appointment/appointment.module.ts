import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
@Module({ imports: [DatabaseModule, NotificationModule.register(), RealtimeModule], controllers: [AppointmentController], providers: [AppointmentLifecycleService], exports: [AppointmentLifecycleService] })
export class AppointmentModule {}
