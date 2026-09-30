import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PlantsModule } from './plants/plants.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SearchModule } from './search/search.module';
import { UploadsModule } from './uploads/uploads.module';
import { VendorsModule } from './vendors/vendors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    DiscoveryModule,
    SearchModule,
    RealtimeModule,
    CartModule,
    OrdersModule,
    VendorsModule,
    ProductsModule,
    PlantsModule,
    UploadsModule,
  ],
})
export class AppModule {}
