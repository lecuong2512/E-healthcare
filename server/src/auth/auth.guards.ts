import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { SessionService, AccessClaims } from "./session.service";
import { PUBLIC_ROUTE, REQUIRED_ROLES } from "./auth.decorators";
import { Role } from "../../../shared/src/enums/role.enum";

export interface AuthenticatedRequest extends Request {
  auth?: AccessClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? "",
    );
    request.auth = await this.sessions.authenticate(match?.[1]);
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const roles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Mặc định từ chối nếu route bảo vệ chưa khai báo vai trò được phép.
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!roles?.length || !request.auth || !roles.includes(request.auth.role))
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Bạn không có quyền truy cập chức năng này.",
      });
    return true;
  }
}
