import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CreateDoctorReviewRequest } from '@shared/interfaces';

export class CreateDoctorReviewDto implements CreateDoctorReviewRequest {
  @IsUUID()
  appointmentId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}
