import {
  INestApplication,
  ValidationPipe,
  ForbiddenException,
} from "@nestjs/common";
import { environment } from "./config/environment";
import { usesSecureCookies } from "./modules/auth/cookie-security";
import cookieParser from "cookie-parser";
import { Request, Response, NextFunction } from "express";

export function configureApp(app: INestApplication): void {
  // Báo lỗi sớm nếu production vô tình tắt Secure Cookie.
  usesSecureCookies();
  app.use(cookieParser());
  // Từ chối thao tác xác thực từ origin khác khi đã cấu hình frontend tin cậy.
  app.use((request: Request, _response: Response, next: NextFunction) => {
    if (
      request.method === "POST" &&
      request.path.startsWith("/api/v1/auth/") &&
      request.headers.origin &&
      environment.FRONTEND_URL
    ) {
      let allowed = false;
      try {
        allowed =
          request.headers.origin === new URL(environment.FRONTEND_URL).origin;
      } catch {
        /* Cấu hình URL sai không được chấp nhận. */
      }
      if (!allowed)
        return next(new ForbiddenException("Nguồn yêu cầu không được phép."));
    }
    next();
  });
  if (environment.TRUSTED_PROXY_CIDRS) {
    const proxies = environment.TRUSTED_PROXY_CIDRS.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    app.getHttpAdapter().getInstance().set("trust proxy", proxies);
  }
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    }),
  );
}
