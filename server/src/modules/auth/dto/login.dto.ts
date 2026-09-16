import { Transform } from "class-transformer";
import { IsString, Length, MaxLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(1, 100)
  identifier!: string;

  @IsString()
  @Length(1, 72)
  password!: string;
}
