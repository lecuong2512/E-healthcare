import { IsDateString, IsOptional } from "class-validator";

export class ScheduleRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
