import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { Role } from "../../../../shared/src/enums/role.enum";
import { Public, Roles } from "../../common/decorators/auth.decorators";
import { LoginDto } from "./dto/login.dto";
import { LoginService } from "./login.service";
import { SessionService, IssuedSession, REFRESH_TTL } from "./session.service";
import { AuthenticatedRequest } from "../../common/guards/authenticated-request";
import { refreshCookieOptions } from "./cookie-security";
import { auditTransportContextFromRequest } from '../audit/audit-context';

export const REFRESH_COOKIE = "ehealth_refresh";

export function writeSession(response: Response, session: IssuedSession) {
  response.setHeader("Cache-Control", "no-store");
  response.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...refreshCookieOptions(
      (session.refreshExpiresIn ?? REFRESH_TTL) * 1000,
    ),
  });
  return { accessToken: session.accessToken, role: session.role, user: session.user };
}

@Controller("auth")
export class SessionController {
  constructor(
    private readonly loginService: LoginService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return writeSession(
      response,
      await this.loginService.login(dto, auditTransportContextFromRequest(request)),
    );
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return writeSession(
        response,
        await this.sessions.refresh(request.cookies?.[REFRESH_COOKIE]),
      );
    } catch (error) {
      response.clearCookie(
        REFRESH_COOKIE,
        refreshCookieOptions(REFRESH_TTL * 1000),
      );
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.logout(request.cookies?.[REFRESH_COOKIE]);
    await this.sessions.blacklistAccessToken(/^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? "")?.[1]);
    response.clearCookie(
      REFRESH_COOKIE,
      refreshCookieOptions(REFRESH_TTL * 1000),
    );
  }

  @Get("me")
  @Roles(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  async me(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const user = await this.sessions.getCurrentUser(
      request.auth!.userId,
      request.auth!.role,
    );
    return { userId: request.auth!.userId, role: request.auth!.role, user };
  }
}
