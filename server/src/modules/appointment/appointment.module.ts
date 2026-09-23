import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationModule } from '../notification/notification.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
import { AppointmentPaymentExpiryScheduler } from './appointment-payment-expiry.scheduler';
@Module({ imports: [DatabaseModule, NotificationModule.register()], controllers: [AppointmentController], providers: [AppointmentLifecycleService, AppointmentPaymentExpiryScheduler], exports: [AppointmentLifecycleService] })
export class AppointmentModule {}
