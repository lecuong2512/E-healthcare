import { Controller, Get, NotFoundException, Req } from '@nestjs/common';
import { Role } from '@shared/enums';
import { QueueSnapshot } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { QueueQueryService } from './queue-query.service';

@Controller('reception/queue')
@Roles(Role.RECEPTIONIST)
export class ReceptionQueueController {
  constructor(private readonly queries: QueueQueryService) {}

  @Get()
  snapshot(): Promise<QueueSnapshot> {
    return this.queries.snapshot('RECEPTION');
  }
}

@Controller('doctor/queue')
@Roles(Role.DOCTOR)
export class DoctorQueueController {
  constructor(
    private readonly queries: QueueQueryService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async snapshot(@Req() request: AuthenticatedRequest): Promise<QueueSnapshot> {
    const doctor = await this.dataSource.getRepository(DoctorEntity)
      .findOneBy({ userId: request.auth!.userId });
    if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');
    return this.queries.snapshot('DOCTOR', doctor.id);
  }
}
