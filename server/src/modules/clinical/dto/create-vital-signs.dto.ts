import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { VitalSignsInput } from '@shared/interfaces';

export class VitalSignsDto implements VitalSignsInput {
  @IsString({ message: 'Huyết áp phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Huyết áp không được để trống.' })
  @Matches(/^\d{2,3}\/\d{2,3}$/, {
    message: 'Huyết áp phải đúng định dạng tâm thu/tâm trương (ví dụ: 120/80).',
  })
  bloodPressure!: string;

  @IsInt({ message: 'Mạch phải là số nguyên (lần/phút).' })
  @Min(30, { message: 'Mạch tối thiểu là 30 lần/phút.' })
  @Max(250, { message: 'Mạch tối đa là 250 lần/phút.' })
  pulse!: number;

  @IsNumber({}, { message: 'Thân nhiệt phải là số (°C).' })
  @Min(30, { message: 'Thân nhiệt không hợp lệ (tối thiểu 30°C).' })
  @Max(45, { message: 'Thân nhiệt không hợp lệ (tối đa 45°C).' })
  temperature!: number;

  @IsInt({ message: 'Nhịp thở phải là số nguyên (lần/phút).' })
  @Min(5, { message: 'Nhịp thở tối thiểu là 5 lần/phút.' })
  @Max(80, { message: 'Nhịp thở tối đa là 80 lần/phút.' })
  respiratoryRate!: number;

  @IsNumber({}, { message: 'Cân nặng phải là số (kg).' })
  @Min(1, { message: 'Cân nặng tối thiểu là 1 kg.' })
  @Max(350, { message: 'Cân nặng tối đa là 350 kg.' })
  weight!: number;

  @IsNumber({}, { message: 'Chiều cao phải là số (cm).' })
  @Min(30, { message: 'Chiều cao tối thiểu là 30 cm.' })
  @Max(260, { message: 'Chiều cao tối đa là 260 cm.' })
  height!: number;
}

