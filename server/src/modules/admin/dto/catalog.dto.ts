import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CatalogListDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() active?: boolean;
}

export class CatalogVisibilityDto { @IsBoolean() isActive!: boolean; }

export class CatalogMutationDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() activeIngredient?: string;
  @IsOptional() @IsString() strength?: string;
  @IsOptional() @IsString() packageUnit?: string;
  @IsOptional() @IsString() contraindications?: string;
  @IsOptional() @IsInt() @Min(0) referencePrice?: number;
  @IsOptional() @IsInt() @Min(0) listedPrice?: number;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsUUID() headDoctorId?: string;
}
