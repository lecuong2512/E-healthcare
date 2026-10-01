import { Transform } from "class-transformer";
import { IsEnum, IsISO8601, IsString, Length, Matches } from "class-validator";
import { Gender } from "../../../../../shared/src/enums/gender.enum";

export class GoogleCompleteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
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
