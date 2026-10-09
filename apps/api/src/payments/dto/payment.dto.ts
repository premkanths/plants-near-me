import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  razorpayPaymentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  razorpaySignature!: string;
}

export class FailPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
