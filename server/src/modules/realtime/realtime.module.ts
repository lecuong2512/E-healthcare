import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { DoctorQueueController, ReceptionQueueController } from './queue.controller';
import { QueueEventsService } from './queue-events.service';
import { QueueGateway } from './queue.gateway';
import { QueueQueryService } from './queue-query.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ReceptionQueueController, DoctorQueueController],
  providers: [QueueQueryService, QueueGateway, QueueEventsService],
  exports: [QueueEventsService],
})
export class RealtimeModule {}
