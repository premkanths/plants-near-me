import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/** Hard ceiling per line — a nursery is not a wholesaler, and it caps abuse. */
export const MAX_LINE_QUANTITY = 50;

export class AddCartItemDto {
  @IsUUID('4', { message: 'productId must be a valid product id' })
  productId!: string;

  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(MAX_LINE_QUANTITY, { message: `quantity must not exceed ${MAX_LINE_QUANTITY}` })
  @Type(() => Number)
  quantity = 1;
}

export class UpdateCartItemDto {
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1 — use DELETE to remove the line' })
  @Max(MAX_LINE_QUANTITY, { message: `quantity must not exceed ${MAX_LINE_QUANTITY}` })
  @Type(() => Number)
  quantity!: number;
}
