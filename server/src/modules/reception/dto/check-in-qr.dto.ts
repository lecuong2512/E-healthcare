import { IsString, MaxLength } from 'class-validator';

export class CheckInQrDto {
  @IsString()
  @MaxLength(2048)
  qrToken!: string;
}
