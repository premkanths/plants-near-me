import { BadRequestException, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Public key id for the browser widget. Never the secret. */
  @Get('config')
  @Public()
  config() {
    return this.payments.config();
  }

  /**
   * Razorpay calls this; there is no user session, so the signature over the
   * raw body is the authentication.
   */
  @Post('webhook')
  @Public()
  webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const raw = request.rawBody?.toString('utf8');
    if (!raw) throw new BadRequestException('Missing request body');

    return this.payments.handleWebhook(raw, signature ?? '');
  }
}
