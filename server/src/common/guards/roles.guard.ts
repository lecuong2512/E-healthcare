import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../../../../shared/src/enums/role.enum";
import {
  PUBLIC_ROUTE,
  REQUIRED_ROLES,
} from "../decorators/auth.decorators";
import { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'ws') return true;
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
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!roles?.length || !request.auth || !roles.includes(request.auth.role))
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Bạn không có quyền truy cập chức năng này.",
      });
    return true;
  }
}
