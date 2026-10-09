import { createHmac } from 'node:crypto';
import { StubRazorpayGateway, safeEqual, sign } from './razorpay.gateway';

describe('Razorpay signatures', () => {
  const gateway = new StubRazorpayGateway('rzp_test_x', 'the_key_secret', 'the_webhook_secret');

  describe('payment signature', () => {
    /** Exactly what Razorpay documents: HMAC-SHA256 of `order_id|payment_id`. */
    const expected = (orderId: string, paymentId: string) =>
      createHmac('sha256', 'the_key_secret').update(`${orderId}|${paymentId}`).digest('hex');

    it('accepts a correctly signed payment', () => {
      const signature = expected('order_1', 'pay_1');
      expect(gateway.verifyPaymentSignature('order_1', 'pay_1', signature)).toBe(true);
    });

    it('matches the documented HMAC construction', () => {
      expect(gateway.signPayment('order_1', 'pay_1')).toBe(expected('order_1', 'pay_1'));
    });

    it('rejects a signature from a different order', () => {
      const signature = expected('order_OTHER', 'pay_1');
      expect(gateway.verifyPaymentSignature('order_1', 'pay_1', signature)).toBe(false);
    });

    it('rejects a signature from a different payment', () => {
      const signature = expected('order_1', 'pay_OTHER');
      expect(gateway.verifyPaymentSignature('order_1', 'pay_1', signature)).toBe(false);
    });

    it('rejects a signature made with the wrong secret', () => {
      const forged = createHmac('sha256', 'guessed').update('order_1|pay_1').digest('hex');
      expect(gateway.verifyPaymentSignature('order_1', 'pay_1', forged)).toBe(false);
    });

    it('rejects an empty or truncated signature', () => {
      expect(gateway.verifyPaymentSignature('order_1', 'pay_1', '')).toBe(false);
      expect(
        gateway.verifyPaymentSignature(
          'order_1',
          'pay_1',
          expected('order_1', 'pay_1').slice(0, 20),
        ),
      ).toBe(false);
    });
  });

  describe('webhook signature', () => {
    const body = JSON.stringify({ event: 'payment.captured' });

    it('accepts a body signed with the webhook secret', () => {
      expect(gateway.verifyWebhookSignature(body, sign(body, 'the_webhook_secret'))).toBe(true);
    });

    it('rejects the key secret being used instead', () => {
      expect(gateway.verifyWebhookSignature(body, sign(body, 'the_key_secret'))).toBe(false);
    });

    it('rejects a tampered body', () => {
      const signature = sign(body, 'the_webhook_secret');
      const tampered = JSON.stringify({ event: 'payment.failed' });
      expect(gateway.verifyWebhookSignature(tampered, signature)).toBe(false);
    });

    it('rejects a missing signature', () => {
      expect(gateway.verifyWebhookSignature(body, '')).toBe(false);
    });
  });

  describe('safeEqual', () => {
    it('is true only for identical strings', () => {
      expect(safeEqual('abc', 'abc')).toBe(true);
      expect(safeEqual('abc', 'abd')).toBe(false);
    });

    it('handles different lengths without throwing', () => {
      expect(() => safeEqual('short', 'much longer string')).not.toThrow();
      expect(safeEqual('short', 'much longer string')).toBe(false);
    });
  });

  describe('stub order creation', () => {
    it('mints a Razorpay-shaped order id in paise', async () => {
      const order = await gateway.createOrder(52800, 'EP-260930-ABCDEF');

      expect(order.id).toMatch(/^order_/);
      expect(order.amount).toBe(52800);
      expect(order.currency).toBe('INR');
    });

    it('never repeats an order id', async () => {
      const a = await gateway.createOrder(100, 'r1');
      const b = await gateway.createOrder(100, 'r2');
      expect(a.id).not.toBe(b.id);
    });
  });
});
