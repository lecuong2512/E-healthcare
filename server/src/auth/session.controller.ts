import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response, CookieOptions } from "express";
import { Throttle } from "@nestjs/throttler";
import { Role } from "../../../shared/src/enums/role.enum";
import { Public, Roles } from "./auth.decorators";
import { LoginDto } from "./dto/login.dto";
import { LoginService } from "./login.service";
import { SessionService, IssuedSession, REFRESH_TTL } from "./session.service";
import { AuthenticatedRequest } from "./auth.guards";

export const REFRESH_COOKIE = "ehealth_refresh";
export const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: REFRESH_TTL * 1000,
};

export function writeSession(response: Response, session: IssuedSession) {
  response.setHeader("Cache-Control", "no-store");
  response.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...refreshCookieOptions,
    maxAge: (session.refreshExpiresIn ?? REFRESH_TTL) * 1000,
  });
  return { accessToken: session.accessToken, role: session.role };
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
    @Res({ passthrough: true }) response: Response,
  ) {
    return writeSession(response, await this.loginService.login(dto));
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
      response.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
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
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  }

  @Get("me")
  @Roles(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  me(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return { userId: request.auth!.userId, role: request.auth!.role };
  }
}
