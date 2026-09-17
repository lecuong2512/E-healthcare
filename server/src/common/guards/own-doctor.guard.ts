import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../../shared/src/enums/role.enum'; // theo đúng style import tương đối team đang dùng ở guards khác
import { OWN_DOCTOR_PARAM } from '../decorators/own-doctor.decorator';
import { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class OwnDoctorGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName = this.reflector.getAllAndOverride<string>(OWN_DOCTOR_PARAM, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!paramName) return true; // route không gắn @OwnDoctor thì bỏ qua

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth?.role === Role.ADMIN) return true; // Admin không bị giới hạn ownership

    const routeDoctorId = request.params[paramName];
    if (request.auth?.userId !== routeDoctorId) {
      throw new ForbiddenException({
        code: 'NOT_RESOURCE_OWNER',
        message: 'Bạn chỉ có thể thao tác trên dữ liệu của chính mình.',
      });
    }
    return true;
  }
}