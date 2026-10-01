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
    // `.env` ships these keys present but blank, so an empty string has to
    // count as "not configured" — `??` alone would hand the gateway a secret
    // of '' and every signature check would fail in a very confusing way.
    const read = (key: string) => config.get<string>(key)?.trim() || undefined;

    const keyId = read('RAZORPAY_KEY_ID');
    const keySecret = read('RAZORPAY_KEY_SECRET');
    const webhookSecret = read('RAZORPAY_WEBHOOK_SECRET') ?? 'dev_webhook_secret';

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
