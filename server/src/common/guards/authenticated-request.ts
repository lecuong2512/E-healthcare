import { Request } from "express";
import { AccessClaims } from "../../modules/auth/session.service";

export interface AuthenticatedRequest extends Request {
  auth?: AccessClaims;
}
