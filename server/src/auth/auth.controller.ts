import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto, VerifyRegisterDto } from "./dto/register.dto";
import { Throttle } from "@nestjs/throttler";
import { Public } from "./auth.decorators";

@Controller("auth/register")
@Public()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(@Body() dto: RegisterDto) {
    return this.auth.requestRegistration(dto);
  }

  @Post("verify")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  verify(@Body() dto: VerifyRegisterDto) {
    return this.auth.verifyRegistration(dto);
  }
}
