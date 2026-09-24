import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { RedisModule } from "../../common/redis/redis.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpDeliveryService } from "./otp-delivery.service";
import { SessionService } from "./session.service";
import { LoginService } from "./login.service";
import { SessionController } from "./session.controller";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleAuthController } from "./google-auth.controller";
import { PasswordResetController } from "./password-reset.controller";
import { PasswordResetService } from "./password-reset.service";

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [AuthController, SessionController, GoogleAuthController, PasswordResetController],
  providers: [
    AuthService,
    OtpDeliveryService,
    SessionService,
    LoginService,
    GoogleAuthService,
    PasswordResetService,
  ],
  exports: [SessionService],
})
export class AuthModule {}
