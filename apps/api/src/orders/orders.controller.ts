import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Roles('CUSTOMER')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

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
}
