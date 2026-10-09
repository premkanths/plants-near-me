import { Type } from 'class-transformer';
import {
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/; /* 8+ chars, upper, lower, digit */

export class RegisterCustomerDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  @Matches(PASSWORD_RULE, {
    message:
      'Password must be at least 8 characters and include upper case, lower case and a digit',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Phone must be 10-15 digits' })
  phone?: string;
}

export class VendorProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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

  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  @Type(() => Number)
  latitude!: number;

  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  @Type(() => Number)
  longitude!: number;

  @IsOptional()
  @Min(0.5)
  @Type(() => Number)
  deliveryRadiusKm?: number;
}

export class RegisterVendorDto extends RegisterCustomerDto {
  @ValidateNested()
  @Type(() => VendorProfileDto)
  vendor!: VendorProfileDto;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
