import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateVendorProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Phone must be 10-15 digits' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5, { message: 'Delivery radius must be at least 0.5 km' })
  @Max(50, { message: 'Delivery radius cannot exceed 50 km' })
  @Type(() => Number)
  deliveryRadiusKm?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5000)
  @Type(() => Number)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  minOrderValue?: number;
}
