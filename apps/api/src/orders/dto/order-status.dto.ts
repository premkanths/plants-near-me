import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { VendorOrderStatus } from '../../generated/prisma/enums';

const STATUSES = [
  'ORDERED',
  'ACCEPTED',
  'PACKING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REJECTED',
] as const;

export class UpdateOrderStatusDto {
  @IsEnum(STATUSES, { message: `status must be one of: ${STATUSES.join(', ')}` })
  status!: VendorOrderStatus;

  /** Required when rejecting — the customer is told why. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}

export class ListVendorOrdersDto {
  @IsOptional()
  @IsEnum(STATUSES)
  status?: VendorOrderStatus;
}
