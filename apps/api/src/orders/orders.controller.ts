import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import { ConfirmPaymentDto, FailPaymentDto } from '../payments/dto/payment.dto';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Roles('CUSTOMER')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('checkout')
  checkout(@CurrentUser('id') userId: string, @Body() dto: CheckoutDto) {
    return this.orders.checkout(userId, dto);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.orders.listForCustomer(userId);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) orderId: string) {
    return this.orders.getForCustomer(userId, orderId);
  }

  /** Razorpay's browser callback, verified server-side before it is believed. */
  @Post(':id/payment/confirm')
  confirm(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.payments.confirm(userId, orderId, dto);
  }

  /** The customer closed the widget or the card was declined. */
  @Post(':id/payment/failed')
  failed(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: FailPaymentDto,
  ) {
    return this.payments.fail(userId, orderId, dto.reason ?? 'Payment was not completed');
  }

  /**
   * Demo shortcut used when no Razorpay keys are configured: hands back the
   * signature the provider would have returned so the flow can be completed
   * offline. Returns 400 as soon as real keys exist.
   */
  @Post(':id/payment/simulate')
  simulate(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) orderId: string) {
    return this.payments.simulateSuccess(orderId, userId);
  }
}
