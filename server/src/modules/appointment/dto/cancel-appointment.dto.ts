import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  /** The server records the acceptance time; never trust a browser timestamp. */
  @IsBoolean() consentAccepted!: boolean;
}
