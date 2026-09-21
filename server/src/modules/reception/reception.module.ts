import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../common/redis/redis.module';
import { CounterPaymentService } from './counter-payment.service';
import { QueueNumberService } from './queue-number.service';
import { ReceptionController } from './reception.controller';
import { ReceptionService } from './reception.service';
import { WalkInService } from './walk-in.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReceptionAuditService } from './reception-audit.service';

@Module({
  imports: [DatabaseModule, RedisModule, RealtimeModule],
  controllers: [ReceptionController],
  providers: [
    CounterPaymentService, QueueNumberService, ReceptionService, WalkInService,
    ReceptionAuditService,
  ],
})
export class ReceptionModule {}
