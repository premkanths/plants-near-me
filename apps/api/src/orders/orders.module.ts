import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { DeliverySimulatorService } from './delivery-simulator.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { VendorOrdersController } from './vendor-orders.controller';
import { VendorOrdersService } from './vendor-orders.service';

@Module({
  imports: [CartModule],
  controllers: [OrdersController, VendorOrdersController],
  providers: [OrdersService, VendorOrdersService, DeliverySimulatorService],
  exports: [OrdersService, VendorOrdersService],
})
export class OrdersModule {}
