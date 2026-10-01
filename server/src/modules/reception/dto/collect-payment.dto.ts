import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { CounterPaymentMethod } from '@shared/enums';
import { CollectCounterPaymentRequest } from '@shared/interfaces';

export class CollectPaymentDto implements CollectCounterPaymentRequest {
  @IsEnum(CounterPaymentMethod)
  method!: CounterPaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  amountTendered!: number;
}
