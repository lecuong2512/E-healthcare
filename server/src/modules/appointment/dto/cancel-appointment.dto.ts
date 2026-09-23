import { IsOptional, IsString, MaxLength } from 'class-validator';
export class CancelAppointmentDto { @IsOptional() @IsString() @MaxLength(1000) reason?: string; }
