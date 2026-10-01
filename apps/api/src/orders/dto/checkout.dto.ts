import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * The address is snapshotted onto the order, so it is validated here rather
 * than trusted from a profile that the customer may edit later.
 */
export class CheckoutDto {
  @IsString()
  @IsNotEmpty({ message: 'recipientName is required' })
  @MaxLength(120)
  @Transform(trim)
  recipientName!: string;

  @Matches(/^(\+91[-\s]?)?[6-9]\d{9}$/, {
    message: 'recipientPhone must be a valid Indian mobile number',
  })
  @Transform(trim)
  recipientPhone!: string;

  @IsString()
  @IsNotEmpty({ message: 'addressLine1 is required' })
  @MaxLength(200)
  @Transform(trim)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  addressLine2?: string;

  @IsString()
  @IsNotEmpty({ message: 'city is required' })
  @MaxLength(80)
  @Transform(trim)
  city!: string;

  @Matches(/^\d{6}$/, { message: 'pincode must be 6 digits' })
  @Transform(trim)
  pincode!: string;

  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  deliveryLat?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  deliveryLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  notes?: string;

  /**
   * `COD` places the order immediately. `ONLINE` reserves stock and leaves the
   * order in PENDING_PAYMENT until Razorpay confirms the money.
   */
  @IsOptional()
  @IsIn(['COD', 'ONLINE'], { message: 'paymentMethod must be COD or ONLINE' })
  paymentMethod: 'COD' | 'ONLINE' = 'COD';
}
