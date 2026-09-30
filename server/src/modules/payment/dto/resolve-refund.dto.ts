import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveRefundDto {
  @IsIn(['SUCCEEDED', 'FAILED'])
  outcome!: 'SUCCEEDED' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerRefundId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  failureReason?: string;
}
