import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpDeliveryService } from "./otp-delivery.service";
import { SessionService } from "./session.service";
import { LoginService } from "./login.service";
import { SessionController } from "./session.controller";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleAuthController } from "./google-auth.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, SessionController, GoogleAuthController],
  providers: [
    AuthService,
    OtpDeliveryService,
    SessionService,
    LoginService,
    GoogleAuthService,
  ],
  exports: [SessionService],
})
export class AuthModule {}
