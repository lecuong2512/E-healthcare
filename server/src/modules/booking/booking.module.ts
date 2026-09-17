import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
