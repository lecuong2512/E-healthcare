import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AuditAction } from '@shared/enums';
import { AuditLogQuery } from '@shared/interfaces';

export class AuditLogQueryDto implements AuditLogQuery {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  toExclusive!: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([25, 50, 100])
  pageSize = 25;
}
