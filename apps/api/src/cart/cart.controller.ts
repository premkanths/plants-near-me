import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Roles('CUSTOMER')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser('id') userId: string) {
    return this.cart.getCart(userId);
  }

  @Post('items')
  add(@CurrentUser('id') userId: string, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(userId, dto.productId, dto.quantity);
  }

  @Patch('items/:id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(userId, itemId, dto.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) itemId: string) {
    return this.cart.removeItem(userId, itemId);
  }

  @Delete()
  clear(@CurrentUser('id') userId: string) {
    return this.cart.clear(userId);
  }
}
