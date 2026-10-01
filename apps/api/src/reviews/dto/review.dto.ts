import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateReviewDto {
  /** Reviews hang off a delivered vendor order, never off a shop directly. */
  @IsUUID()
  vendorOrderId!: string;

  /** Optional: review one plant from the order rather than the shop overall. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'rating must be between 1 and 5' })
  @Max(5, { message: 'rating must be between 1 and 5' })
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  comment?: string;
}

export class UpdateReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'rating must be between 1 and 5' })
  @Max(5, { message: 'rating must be between 1 and 5' })
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  comment?: string;
}

export class ListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 10;
}
