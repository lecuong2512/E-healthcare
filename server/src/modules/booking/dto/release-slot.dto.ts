import { IsNotEmpty, IsUUID } from 'class-validator';
import { IReleaseSlotRequest } from '@shared/interfaces';

export class ReleaseSlotDto implements IReleaseSlotRequest {
  @IsUUID('all', { message: 'doctorId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'doctorId không được để trống.' })
  doctorId!: string;

  @IsUUID('all', { message: 'slotId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'slotId không được để trống.' })
  slotId!: string;

  @IsUUID('all', { message: 'reservationId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'reservationId không được để trống.' })
  reservationId!: string;
}
