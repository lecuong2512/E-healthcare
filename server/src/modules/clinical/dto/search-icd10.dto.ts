import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchIcd10Dto {
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn kết quả (limit) phải là số nguyên.' })
  @Min(1, { message: 'Limit tối thiểu là 1.' })
  @Max(50, { message: 'Limit tối đa là 50.' })
  limit?: number;
}

