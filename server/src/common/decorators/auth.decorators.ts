import { SetMetadata } from "@nestjs/common";
import { Role } from "../../../../shared/src/enums/role.enum";

export const PUBLIC_ROUTE = "auth:public";
export const REQUIRED_ROLES = "auth:roles";
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);
