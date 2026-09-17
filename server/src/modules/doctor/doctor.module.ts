import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { DoctorScheduleController } from './doctor-schedule.controller';
import { DoctorScheduleService } from './doctor-schedule.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorEntity, DoctorScheduleEntity]),
  ],
  controllers: [DoctorScheduleController],
  providers: [DoctorScheduleService],
})
export class DoctorModule {}