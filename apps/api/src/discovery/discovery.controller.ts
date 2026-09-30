import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { DiscoveryService } from './discovery.service';
import {
  NearbyProductsQueryDto,
  NearbyVendorsQueryDto,
  OptionalPointQueryDto,
} from './dto/discovery.dto';

/** Browsing the marketplace needs no account — these routes are deliberately public. */
@Public()
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('nearby/vendors')
  vendors(@Query() query: NearbyVendorsQueryDto) {
    return this.discovery.nearbyVendors(query);
  }

  @Get('nearby/products')
  products(@Query() query: NearbyProductsQueryDto) {
    return this.discovery.nearbyProducts(query);
  }

  @Get('shops/:slug')
  shop(@Param('slug') slug: string, @Query() point: OptionalPointQueryDto) {
    return this.discovery.vendorBySlug(slug, point);
  }
}
