import { IsDateString, IsInt, IsOptional, Matches, Min } from "class-validator";

export class UpdateDoctorScheduleDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  endTime?: string;

  @IsInt()
  @Min(0)
  version!: number;
}
