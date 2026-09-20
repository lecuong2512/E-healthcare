import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Role } from '@shared/enums';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { OWN_DOCTOR_PARAM } from '../decorators/own-doctor.decorator';
import { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class OwnDoctorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const paramName = this.reflector.getAllAndOverride<string>(
      OWN_DOCTOR_PARAM,
      [context.getHandler(), context.getClass()],
    );
    if (!paramName) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth?.role !== Role.DOCTOR) return true;

    const routeDoctorId = request.params[paramName];
    if (typeof routeDoctorId !== 'string') {
      throw new ForbiddenException({
        code: 'NOT_RESOURCE_OWNER',
        message: 'Bạn chỉ có thể thao tác trên dữ liệu của chính mình.',
      });
    }

    const ownsDoctorProfile = await this.dataSource
      .getRepository(DoctorEntity)
      .existsBy({
        id: routeDoctorId,
        userId: request.auth.userId,
      });

    if (!ownsDoctorProfile) {
      throw new ForbiddenException({
        code: 'NOT_RESOURCE_OWNER',
        message: 'Bạn chỉ có thể thao tác trên dữ liệu của chính mình.',
      });
    }
    return true;
  }
}