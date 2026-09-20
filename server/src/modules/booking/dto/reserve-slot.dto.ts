import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { IReserveSlotRequest } from '@shared/interfaces';

export class ReserveSlotDto implements IReserveSlotRequest {
  @IsUUID('all', { message: 'doctorId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'doctorId không được để trống.' })
  doctorId!: string;

  @IsUUID('all', { message: 'slotId phải là UUID hợp lệ.' })
  @IsNotEmpty({ message: 'slotId không được để trống.' })
  slotId!: string;

  @IsOptional()
  @IsString({ message: 'userId phải là chuỗi ký tự.' })
  userId?: string;
}
