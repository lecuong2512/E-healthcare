import { IsIn } from 'class-validator';

export type ReconciliationResolution =
  | 'MARK_FAILED'
  | 'MARK_REFUND_REQUIRED'
  | 'RETRY_PROVIDER_QUERY';

export class ResolveReconciliationDto {
  @IsIn(['MARK_FAILED', 'MARK_REFUND_REQUIRED', 'RETRY_PROVIDER_QUERY'])
  outcome!: ReconciliationResolution;
}
