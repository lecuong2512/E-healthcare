import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
import { AppointmentNoShowScheduler } from './appointment-no-show.scheduler';
import { AppointmentPaymentExpiryScheduler } from './appointment-payment-expiry.scheduler';
@Module({ imports: [DatabaseModule], controllers: [AppointmentController], providers: [AppointmentLifecycleService, AppointmentNoShowScheduler, AppointmentPaymentExpiryScheduler], exports: [AppointmentLifecycleService] })
export class AppointmentModule {}
