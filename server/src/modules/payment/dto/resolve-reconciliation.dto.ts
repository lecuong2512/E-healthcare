import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export type ReconciliationResolution =
  | 'MARK_FAILED'
  | 'MARK_REFUND_REQUIRED'
  | 'RETRY_PROVIDER_QUERY';

export class ResolveReconciliationDto {
  @IsIn(['MARK_FAILED', 'MARK_REFUND_REQUIRED', 'RETRY_PROVIDER_QUERY'])
  outcome!: ReconciliationResolution;

  @ValidateIf((dto: ResolveReconciliationDto) =>
    dto.outcome === 'MARK_REFUND_REQUIRED' || dto.note !== undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  note?: string;
}
