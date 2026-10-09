import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

export const SUNLIGHT = ['FULL_SUN', 'PARTIAL_SUN', 'SHADE'] as const;
export const WATER = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const DIFFICULTY = ['EASY', 'MODERATE', 'HARD'] as const;
export const PLACEMENT = ['INDOOR', 'OUTDOOR', 'BOTH'] as const;

const toNumber = ({ value }: { value: unknown }) =>
  value === '' || value === undefined || value === null ? undefined : Number(value);

const toBool = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
};

/** `?placement=INDOOR&placement=BOTH` and `?placement=INDOOR,BOTH` both work. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.flatMap((entry) => String(entry).split(','));
  return String(value).split(',');
};

export class SearchProductsDto {
  /** The raw phrase. Parsed by websearch_to_tsquery, so "quoted phrases" and -negation work. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  // ── plant traits ──────────────────────────────────────────────
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(SUNLIGHT, { each: true })
  sunlight?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(WATER, { each: true })
  water?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(DIFFICULTY, { each: true })
  difficulty?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(PLACEMENT, { each: true })
  placement?: string[];

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  petFriendly?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  airPurifying?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  flowering?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  // ── listing filters ───────────────────────────────────────────
  @IsOptional()
  @Transform(toNumber)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(toNumber)
  @Min(0)
  maxPrice?: number;

  /** Defaults to true: a marketplace should not show what it cannot sell today. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  inStockOnly = true;

  // ── optional location awareness ───────────────────────────────
  @IsOptional()
  @IsLatitude()
  @Transform(toNumber)
  lat?: number;

  @IsOptional()
  @IsLongitude()
  @Transform(toNumber)
  lng?: number;

  @IsOptional()
  @Transform(toNumber)
  @Min(0.1)
  @Max(50)
  radiusKm?: number;

  // ── presentation ──────────────────────────────────────────────
  @IsOptional()
  @IsIn(['relevance', 'price_asc', 'price_desc', 'distance', 'rating'])
  sort: 'relevance' | 'price_asc' | 'price_desc' | 'distance' | 'rating' = 'relevance';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  pageSize = 20;
}

export class SuggestDto {
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q!: string;
}
