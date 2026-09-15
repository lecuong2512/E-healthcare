import { Transform } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { PASSWORD_PATTERN } from "../../common/utils/crypto.util";

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
}

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @ValidateIf(
    (dto: RegisterDto) =>
      dto.email !== undefined || dto.phoneNumber === undefined,
  )
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @Transform(trim)
  @ValidateIf(
    (dto: RegisterDto) =>
      dto.phoneNumber !== undefined || dto.email === undefined,
  )
  @IsString()
  @Matches(/^(?:0[35789][0-9]{8}|\+[1-9][0-9]{7,14})$/, {
    message:
      "Số điện thoại phải là số Việt Nam hợp lệ hoặc theo định dạng E.164.",
  })
  phoneNumber?: string;

  @IsString()
  @MaxLength(72)
  @Matches(PASSWORD_PATTERN, {
    message:
      "Mật khẩu phải có tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.",
  })
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  fullName!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  dateOfBirth!: string;
}

export class VerifyRegisterDto {
  @IsUUID("4")
  registrationId!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "OTP phải gồm đúng 6 chữ số." })
  otp!: string;
}
