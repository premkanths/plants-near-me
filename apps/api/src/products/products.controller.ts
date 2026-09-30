import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentVendorId, Roles } from '../auth/decorators';
import {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
  UpdateStockDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

/** Vendor-facing product management. Customer-facing search arrives in Step 6. */
@Roles('VENDOR')
@Controller('vendor/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentVendorId() vendorId: string, @Query() query: ListProductsQueryDto) {
    return this.products.listForVendor(vendorId, query);
  }

  @Get('stats')
  stats(@CurrentVendorId() vendorId: string) {
    return this.products.statsForVendor(vendorId);
  }

  @Get(':id')
  findOne(@CurrentVendorId() vendorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOneForVendor(vendorId, id);
  }

  @Post()
  create(@CurrentVendorId() vendorId: string, @Body() dto: CreateProductDto) {
    return this.products.create(vendorId, dto);
  }

  @Patch(':id')
  update(
    @CurrentVendorId() vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(vendorId, id, dto);
  }

  @Patch(':id/stock')
  updateStock(
    @CurrentVendorId() vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.products.updateStock(vendorId, id, dto.stock);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentVendorId() vendorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(vendorId, id);
  }
}
