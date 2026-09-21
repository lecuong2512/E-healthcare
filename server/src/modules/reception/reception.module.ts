import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CounterPaymentService } from './counter-payment.service';
import { QueueNumberService } from './queue-number.service';
import { ReceptionController } from './reception.controller';
import { ReceptionService } from './reception.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ReceptionController],
  providers: [CounterPaymentService, QueueNumberService, ReceptionService],
})
export class ReceptionModule {}
