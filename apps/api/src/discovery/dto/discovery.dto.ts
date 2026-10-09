import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Bengaluru sits at ~12.97N 77.59E; the app is city-scoped but the API stays global. */
export const DEFAULT_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 50;

const toNumber = ({ value }: { value: unknown }) =>
  value === '' || value === undefined || value === null ? undefined : Number(value);

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : undefined;

/** Everything a location-aware query needs: where you are and how far you will go. */
export class NearbyQueryDto {
  @IsLatitude({ message: 'lat must be a latitude between -90 and 90' })
  @Transform(toNumber)
  @Type(() => Number)
  lat!: number;

  @IsLongitude({ message: 'lng must be a longitude between -180 and 180' })
  @Transform(toNumber)
  @Type(() => Number)
  lng!: number;

  /** Search radius in kilometres. Capped so nobody can ask for the whole planet. */
  @IsOptional()
  @Type(() => Number)
  @Transform(toNumber)
  @Min(0.1, { message: 'radiusKm must be at least 0.1' })
  @Max(MAX_RADIUS_KM, { message: `radiusKm must not exceed ${MAX_RADIUS_KM}` })
  radiusKm: number = DEFAULT_RADIUS_KM;

  /** Only vendors whose own delivery radius reaches the customer. */
  @IsOptional()
  @Transform(toBool)
  deliverableOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  pageSize: number = 12;
}

export class NearbyVendorsQueryDto extends NearbyQueryDto {
  @IsOptional()
  @IsIn(['distance', 'rating', 'name'], { message: 'sort must be distance, rating or name' })
  sort: 'distance' | 'rating' | 'name' = 'distance';

  /** Free-text match on the shop name (trigram index). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class NearbyProductsQueryDto extends NearbyQueryDto {
  @IsOptional()
  @IsIn(['distance', 'price_asc', 'price_desc', 'rating'], {
    message: 'sort must be distance, price_asc, price_desc or rating',
  })
  sort: 'distance' | 'price_asc' | 'price_desc' | 'rating' = 'distance';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @Transform(toNumber)
  @Min(0)
  maxPrice?: number;
}

/** Optional coordinates — used on the public vendor page to show "2.4 km away". */
export class OptionalPointQueryDto {
  @IsOptional()
  @IsLatitude()
  @Transform(toNumber)
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsLongitude()
  @Transform(toNumber)
  @Type(() => Number)
  lng?: number;
}
