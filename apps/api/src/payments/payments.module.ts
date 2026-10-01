import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { LiveRazorpayGateway, RazorpayGateway, StubRazorpayGateway } from './razorpay.gateway';

/**
 * Picks the gateway from the environment at startup.
 *
 * Real keys → the live test-mode API. No keys → the stub, so the project runs
 * end to end on a laptop with no credentials. The choice is logged once so
 * nobody is left wondering which one they are using.
 */
const gatewayProvider = {
  provide: RazorpayGateway,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RazorpayGateway => {
    const keyId = config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = config.get<string>('RAZORPAY_KEY_SECRET');
    const webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? 'dev_webhook_secret';

    if (keyId && keySecret) {
      return new LiveRazorpayGateway(keyId, keySecret, webhookSecret);
    }
    return new StubRazorpayGateway('rzp_test_stub', 'stub_key_secret', webhookSecret);
  },
};

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, gatewayProvider],
  exports: [PaymentsService, RazorpayGateway],
})
export class PaymentsModule {}
