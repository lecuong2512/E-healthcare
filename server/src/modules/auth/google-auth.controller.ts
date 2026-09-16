import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Public } from "../../common/decorators/auth.decorators";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleCompleteDto } from "./dto/google-complete.dto";
import { environment } from "../../config/environment";
import { writeSession } from "./session.controller";
import { googleCookieBase } from "./cookie-security";

// Cookie cho phiên OAuth.
const FLOW_COOKIE = "ehealth_google_flow";
const COMPLETE_COOKIE = "ehealth_google_complete";
// API Google không cần JWT.
@Public()
@Controller("auth/google")
export class GoogleAuthController {

  constructor(private readonly google: GoogleAuthService) {}

  private frontendUrl(): string {
    if (!environment.FRONTEND_URL)
      throw new ServiceUnavailableException("Chưa cấu hình FRONTEND_URL.");
    const url = new URL(environment.FRONTEND_URL);
    if (environment.NODE_ENV === "production" && url.protocol !== "https:")
      throw new ServiceUnavailableException("FRONTEND_URL phải dùng HTTPS.");
    return url.origin;
  }

  // Bắt đầu đăng nhập Google.
  @Get()
  async start(@Res() response: Response) {
    this.frontendUrl();
    const flow = await this.google.start();
    response.setHeader("Cache-Control", "no-store");
    response.cookie(FLOW_COOKIE, flow.browserToken, {
      ...googleCookieBase(),
      sameSite: "lax",
      maxAge: 300000,
    });
    response.redirect(flow.url);
  }

  // Google callback về sau khi xác thực.
  @Get("callback")
  async callback(
    @Query("code") code: unknown,
    @Query("state") state: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const frontend = this.frontendUrl();
    
    const browserToken = request.cookies?.[FLOW_COOKIE]; 
    response.clearCookie(FLOW_COOKIE, {
      ...googleCookieBase(),
      sameSite: "lax",
    });
    response.setHeader("Cache-Control", "no-store");
    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      typeof browserToken !== "string" ||
      code.length > 4096 ||
      state.length > 256
    ) {
      throw new UnauthorizedException("Phiên xác thực Google không hợp lệ.");
    }
    const result = await this.google.callback(code, state, browserToken);
    //Ktra user có sẵn 
    if (result.session) {
      writeSession(response, result.session);
      response.redirect(`${frontend}/login?google=success`);
    } else {
      response.cookie(COMPLETE_COOKIE, result.completionToken, {
        ...googleCookieBase(),
        sameSite: "strict",
        maxAge: 600000,
      });
      response.redirect(`${frontend}/register?google=complete`);
    }
  }

  // Hoàn tất đăng ký Google lần đầu.
  @Post("complete")
  @HttpCode(200)
  async complete(
    @Body() dto: GoogleCompleteDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[COMPLETE_COOKIE];
    if (typeof token !== "string" || token.length > 256)
      throw new UnauthorizedException("Phiên đăng ký Google không hợp lệ.");
    const session = await this.google.complete(token, dto);
    response.clearCookie(COMPLETE_COOKIE, {
      ...googleCookieBase(),
      sameSite: "strict",
    });
    return writeSession(response, session);
  }
}
