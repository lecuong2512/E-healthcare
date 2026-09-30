import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PushSubscribeDto {
  @IsNotEmpty({ message: 'endpoint là bắt buộc' })
  @IsString()
  endpoint!: string;

  @IsOptional()
  keys?: {
    p256dh: string;
    auth: string;
  };

  @IsOptional()
  @IsString()
  p256dh?: string;

  @IsOptional()
  @IsString()
  auth?: string;
}
