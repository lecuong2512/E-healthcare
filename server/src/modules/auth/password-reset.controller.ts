import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/auth.decorators";
import { ForgotPasswordDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { PasswordResetService } from "./password-reset.service";

@Public()
@Controller("auth")
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  request(@Body() dto: ForgotPasswordDto) { return this.resets.request(dto.identifier); }

  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  reset(@Body() dto: ResetPasswordDto) { return this.resets.reset(dto); }
}
