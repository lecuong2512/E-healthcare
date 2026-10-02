import { Controller, Get, Header, NotFoundException, Post, Req } from '@nestjs/common';
import { Role } from '@shared/enums';
import { PublicQueueBoardToken, QueueSnapshot } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { QueueQueryService } from './queue-query.service';
import { QueueBoardTokenService } from './queue-board-token.service';

@Controller('reception/queue')
@Roles(Role.RECEPTIONIST)
export class ReceptionQueueController {
  constructor(
    private readonly queries: QueueQueryService,
    private readonly boardTokens: QueueBoardTokenService,
  ) {}

  @Get()
  snapshot(): Promise<QueueSnapshot> {
    return this.queries.snapshot('RECEPTION');
  }

  @Post('board-token')
  @Header('Cache-Control', 'no-store')
  issueBoardToken(): PublicQueueBoardToken {
    return this.boardTokens.issue();
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
    const doctor = await this.dataSource.getRepository(DoctorEntity).findOne({
      where: { userId: request.auth!.userId },
      relations: { user: true, specialty: true },
    });
    if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');
    const snap = await this.queries.snapshot('DOCTOR', doctor.id);
    return {
      ...snap,
      doctor: {
        id: doctor.id,
        fullName: doctor.user?.fullName || 'Bác sĩ',
        roomNumber: doctor.roomNumber,
        specialtyName: doctor.specialty?.name,
      },
    };
  }
}
