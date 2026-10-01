import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** `?approved=true` arrives as a string; coerce the three sane spellings. */
const toBool = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export const VENDOR_FILTERS = ['all', 'pending', 'approved', 'suspended'] as const;
export type VendorFilter = (typeof VENDOR_FILTERS)[number];

export class ListVendorsDto {
  @IsOptional()
  @IsIn(VENDOR_FILTERS)
  status: VendorFilter = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ListUsersDto {
  @IsOptional()
  @IsIn(['CUSTOMER', 'VENDOR', 'ADMIN'])
  role?: 'CUSTOMER' | 'VENDOR' | 'ADMIN';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

/** Approve, un-approve or suspend a shop. At least one flag must be present. */
export class UpdateVendorStateDto {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  suspended?: boolean;
}

export class UpdateUserStateDto {
  @Transform(toBool)
  @IsBoolean()
  isActive!: boolean;
}

export class AnalyticsRangeDto {
  /** How many days of history the charts cover. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days = 30;
}
