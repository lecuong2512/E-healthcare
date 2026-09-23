import { IsEnum } from 'class-validator';
import { AppointmentStatus } from '@shared/enums';
export class UpdateAppointmentStatusDto { @IsEnum(AppointmentStatus) status!: AppointmentStatus; }
