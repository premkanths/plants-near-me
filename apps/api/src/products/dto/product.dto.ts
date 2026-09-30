import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsUUID('4', { message: 'plantId must be a valid plant id' })
  plantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price must be a number with at most 2 decimals' })
  @Min(0)
  @Max(1_000_000)
  @Type(() => Number)
  price!: number;

  @IsInt()
  @Min(0)
  @Max(100_000)
  @Type(() => Number)
  stock!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  potSize?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  active?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  potSize?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  active?: boolean;
}

export class UpdateStockDto {
  @IsInt()
  @Min(0)
  @Max(100_000)
  @Type(() => Number)
  stock!: number;
}

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number;
}
