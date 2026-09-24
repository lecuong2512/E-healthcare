import { Transform } from "class-transformer";
import { IsString, Length, Matches } from "class-validator";

export class ForgotPasswordDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsString()
  @Length(3, 100)
  identifier!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @IsString()
  @Length(8, 72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/)
  newPassword!: string;
}
