import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentVendorId, Roles } from '../auth/decorators';
import { DeliverySimulatorService } from './delivery-simulator.service';
import { ListVendorOrdersDto, UpdateOrderStatusDto } from './dto/order-status.dto';
import { VendorOrdersService } from './vendor-orders.service';

@Controller('vendor/orders')
@Roles('VENDOR')
export class VendorOrdersController {
  constructor(
    private readonly orders: VendorOrdersService,
    private readonly delivery: DeliverySimulatorService,
  ) {}

  @Get()
  list(@CurrentVendorId() vendorId: string, @Query() query: ListVendorOrdersDto) {
    return this.orders.list(vendorId, query.status);
  }

  @Get('stats')
  stats(@CurrentVendorId() vendorId: string) {
    return this.orders.stats(vendorId);
  }

  @Get(':id')
  getOne(@CurrentVendorId() vendorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getOne(vendorId, id);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentVendorId() vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const order = await this.orders.updateStatus(vendorId, id, dto);

    // Dispatching the simulated driver is a side effect of the handoff, kept
    // out of the service so the state machine stays free of timers.
    if (order.status === 'OUT_FOR_DELIVERY') {
      await this.delivery.start(id, () =>
        this.orders.updateStatus(vendorId, id, { status: 'DELIVERED' }),
      );
    }

    return order;
  }
}
