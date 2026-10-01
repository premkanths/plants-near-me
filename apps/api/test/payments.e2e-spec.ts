import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGateway, StubRazorpayGateway, sign } from '../src/payments/razorpay.gateway';

/**
 * Step 9 end to end. The gateway runs in stub mode (no keys in CI), but every
 * signature is a real HMAC, so these tests prove the thing that actually
 * matters: an order becomes PLACED only when a correctly signed payment
 * arrives, and never on a client's say-so.
 */
describe('Payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: StubRazorpayGateway;

  const stamp = Date.now();
  const customer = { email: `payer.${stamp}@eplant.test`, password: 'Password123!' };
  const other = { email: `payer2.${stamp}@eplant.test`, password: 'Password123!' };

  let token: string;
  let otherToken: string;
  let vendorToken: string;
  let product: { id: string; vendorId: string };
  let originalStock: number;
  let originalMin: unknown;

  const address = {
    recipientName: 'Pay Test',
    recipientPhone: '9800000101',
    addressLine1: '42 4th Cross',
    city: 'Bengaluru',
    pincode: '560034',
  };

  const http = () => request(app.getHttpServer());
  const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

  const login = async (email: string, password = 'Password123!') => {
    const { body } = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return body.accessToken as string;
  };

  /** Places an order with the given payment method and returns the response body. */
  const placeOrder = async (paymentMethod: 'COD' | 'ONLINE', bearer = token) => {
    await http().delete('/api/cart').set(auth(bearer));
    await http()
      .post('/api/cart/items')
      .set(auth(bearer))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

    const { body } = await http()
      .post('/api/orders/checkout')
      .set(auth(bearer))
      .send({ ...address, paymentMethod })
      .expect(201);

    return body;
  };

  const stockOf = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock;

  const paymentOf = (masterOrderId: string) =>
    prisma.payment.findUniqueOrThrow({ where: { masterOrderId } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    gateway = app.get(RazorpayGateway) as StubRazorpayGateway;

    for (const account of [customer, other]) {
      await http()
        .post('/api/auth/register')
        .send({ ...account, name: 'Pay Test', phone: '+919800000101' })
        .expect(201);
    }
    token = await login(customer.email);
    otherToken = await login(other.email);

    const found = await prisma.product.findFirstOrThrow({
      where: { active: true, stock: { gt: 3 }, vendor: { approved: true, suspended: false } },
      select: { id: true, vendorId: true, stock: true },
    });
    product = { id: found.id, vendorId: found.vendorId };
    originalStock = found.stock;

    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: product.vendorId },
      select: { minOrderValue: true, user: { select: { email: true } } },
    });
    originalMin = vendor.minOrderValue;
    vendorToken = await login(vendor.user.email);

    await prisma.vendor.update({
      where: { id: product.vendorId },
      data: { minOrderValue: 0 },
    });
    await prisma.product.update({ where: { id: product.id }, data: { stock: 500 } });
  });

  afterAll(async () => {
    await prisma.masterOrder.deleteMany({
      where: { customer: { email: { in: [customer.email, other.email] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [customer.email, other.email] } } });
    await prisma.product.update({ where: { id: product.id }, data: { stock: originalStock } });
    await prisma.vendor.update({
      where: { id: product.vendorId },
      data: { minOrderValue: originalMin as never },
    });
    await app.close();
  });

  describe('configuration', () => {
    it('publishes the key id without any secret', async () => {
      const { body } = await http().get('/api/payments/config').expect(200);

      expect(body.provider).toBe('RAZORPAY');
      expect(body.keyId).toEqual(expect.any(String));
      expect(JSON.stringify(body)).not.toMatch(/secret/i);
    });

    it('is public, because the browser needs it before paying', async () => {
      await http().get('/api/payments/config').expect(200);
    });
  });

  describe('cash on delivery', () => {
    it('places the order immediately and records a pending COD payment', async () => {
      const order = await placeOrder('COD');

      expect(order.status).toBe('PLACED');
      const payment = await paymentOf(order.id);
      expect(payment.provider).toBe('COD');
      expect(payment.status).toBe('PENDING');
      expect(payment.amount.toFixed(2)).toBe(order.grandTotal);
    });

    it('settles the payment once the shop delivers', async () => {
      const order = await placeOrder('COD');
      const slice = order.vendorOrders[0];

      for (const status of [
        'ACCEPTED',
        'PACKING',
        'READY_FOR_PICKUP',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
      ]) {
        await http()
          .patch(`/api/vendor/orders/${slice.id}/status`)
          .set(auth(vendorToken))
          .send({ status })
          .expect(200);
      }

      const payment = await paymentOf(order.id);
      expect(payment.status).toBe('PAID');
      expect(payment.paidAt).toBeInstanceOf(Date);
    });

    it('rejects a confirmation attempt on a COD order', async () => {
      const order = await placeOrder('COD');

      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({ razorpayPaymentId: 'pay_1', razorpaySignature: 'x'.repeat(64) })
        .expect(400);
    });
  });

  describe('online orders start unpaid', () => {
    it('waits in PENDING_PAYMENT and returns the provider order', async () => {
      const order = await placeOrder('ONLINE');

      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.payment.razorpayOrderId).toMatch(/^order_/);
      expect(order.payment.keyId).toEqual(expect.any(String));
    });

    it('reserves stock up front, so the plant cannot be sold twice', async () => {
      const before = await stockOf();
      await placeOrder('ONLINE');
      expect(await stockOf()).toBe(before - 1);
    });

    it('is hidden from the shop until it is paid for', async () => {
      const order = await placeOrder('ONLINE');
      const slice = order.vendorOrders[0];

      const { body } = await http().get('/api/vendor/orders').set(auth(vendorToken)).expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).not.toContain(slice.id);

      await http().get(`/api/vendor/orders/${slice.id}`).set(auth(vendorToken)).expect(404);
    });

    it('cannot be advanced by the shop while unpaid', async () => {
      const order = await placeOrder('ONLINE');
      const slice = order.vendorOrders[0];

      // Even addressing it directly (as if the id leaked) is refused.
      const response = await http()
        .patch(`/api/vendor/orders/${slice.id}/status`)
        .set(auth(vendorToken))
        .send({ status: 'ACCEPTED' });

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('confirming a payment', () => {
    const signatureFor = (razorpayOrderId: string, paymentId: string) =>
      gateway.signPayment(razorpayOrderId, paymentId);

    it('accepts a correctly signed payment and places the order', async () => {
      const order = await placeOrder('ONLINE');
      const signature = signatureFor(order.payment.razorpayOrderId, 'pay_ok');

      const { body } = await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({ razorpayPaymentId: 'pay_ok', razorpaySignature: signature })
        .expect(201);

      expect(body.status).toBe('PAID');
      const after = await prisma.masterOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('PLACED');
    });

    it('releases the order to the shop once paid', async () => {
      const order = await placeOrder('ONLINE');
      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({
          razorpayPaymentId: 'pay_release',
          razorpaySignature: signatureFor(order.payment.razorpayOrderId, 'pay_release'),
        })
        .expect(201);

      const { body } = await http().get('/api/vendor/orders').set(auth(vendorToken)).expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).toContain(order.vendorOrders[0].id);
    });

    it('refuses a forged signature and leaves the order unpaid', async () => {
      const order = await placeOrder('ONLINE');

      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({ razorpayPaymentId: 'pay_forged', razorpaySignature: 'f'.repeat(64) })
        .expect(400);

      const after = await prisma.masterOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('PENDING_PAYMENT');
      expect((await paymentOf(order.id)).status).toBe('PENDING');
    });

    it('refuses a signature that belongs to a different payment id', async () => {
      const order = await placeOrder('ONLINE');
      const signature = signatureFor(order.payment.razorpayOrderId, 'pay_A');

      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({ razorpayPaymentId: 'pay_B', razorpaySignature: signature })
        .expect(400);
    });

    it('is idempotent when the browser retries', async () => {
      const order = await placeOrder('ONLINE');
      const body = {
        razorpayPaymentId: 'pay_twice',
        razorpaySignature: signatureFor(order.payment.razorpayOrderId, 'pay_twice'),
      };

      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send(body)
        .expect(201);
      const second = await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send(body)
        .expect(201);

      expect(second.body.status).toBe('PAID');
      expect(await prisma.vendorOrder.count({ where: { masterOrderId: order.id } })).toBe(1);
    });

    it('will not let another customer pay for someone else’s order', async () => {
      const order = await placeOrder('ONLINE');

      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(otherToken))
        .send({
          razorpayPaymentId: 'pay_thief',
          razorpaySignature: signatureFor(order.payment.razorpayOrderId, 'pay_thief'),
        })
        .expect(404);
    });

    it('requires a session', async () => {
      const order = await placeOrder('ONLINE');
      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .send({ razorpayPaymentId: 'pay_x', razorpaySignature: 'y'.repeat(64) })
        .expect(401);
    });
  });

  describe('abandoned payment', () => {
    it('cancels the order and returns the reserved stock', async () => {
      const before = await stockOf();
      const order = await placeOrder('ONLINE');
      expect(await stockOf()).toBe(before - 1);

      const { body } = await http()
        .post(`/api/orders/${order.id}/payment/failed`)
        .set(auth(token))
        .send({ reason: 'Closed the widget' })
        .expect(201);

      expect(body.status).toBe('FAILED');
      expect(await stockOf()).toBe(before);

      const after = await prisma.masterOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('CANCELLED');
    });

    it('does not restock twice if reported again', async () => {
      const order = await placeOrder('ONLINE');
      await http()
        .post(`/api/orders/${order.id}/payment/failed`)
        .set(auth(token))
        .send({})
        .expect(201);

      const afterFirst = await stockOf();
      await http()
        .post(`/api/orders/${order.id}/payment/failed`)
        .set(auth(token))
        .send({})
        .expect(201);

      expect(await stockOf()).toBe(afterFirst);
    });

    it('cannot cancel an order that is already paid', async () => {
      const order = await placeOrder('ONLINE');
      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({
          razorpayPaymentId: 'pay_paid',
          razorpaySignature: gateway.signPayment(order.payment.razorpayOrderId, 'pay_paid'),
        })
        .expect(201);

      await http()
        .post(`/api/orders/${order.id}/payment/failed`)
        .set(auth(token))
        .send({})
        .expect(400);
    });
  });

  describe('webhook', () => {
    const WEBHOOK_SECRET = 'dev_webhook_secret';

    const post = (payload: object, signature?: string) => {
      const raw = JSON.stringify(payload);
      return http()
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature ?? sign(raw, WEBHOOK_SECRET))
        .send(raw);
    };

    const captured = (razorpayOrderId: string) => ({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_hook', order_id: razorpayOrderId } } },
    });

    it('rejects an unsigned call', async () => {
      const order = await placeOrder('ONLINE');
      await post(captured(order.payment.razorpayOrderId), 'not-a-signature').expect(400);

      const after = await prisma.masterOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('PENDING_PAYMENT');
    });

    it('rejects a tampered body even with a valid signature for other content', async () => {
      const order = await placeOrder('ONLINE');
      const honest = JSON.stringify(captured('order_somethingelse'));

      await post(captured(order.payment.razorpayOrderId), sign(honest, WEBHOOK_SECRET)).expect(400);
    });

    it('captures the payment when properly signed', async () => {
      const order = await placeOrder('ONLINE');
      const { body } = await post(captured(order.payment.razorpayOrderId)).expect(201);

      expect(body).toMatchObject({ handled: true, status: 'PAID' });
      const after = await prisma.masterOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('PLACED');
    });

    it('cancels and restocks on payment.failed', async () => {
      const before = await stockOf();
      const order = await placeOrder('ONLINE');

      await post({
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_dead',
              order_id: order.payment.razorpayOrderId,
              error_description: 'Card declined',
            },
          },
        },
      }).expect(201);

      expect(await stockOf()).toBe(before);
      const payment = await paymentOf(order.id);
      expect(payment.status).toBe('FAILED');
      expect(payment.failureReason).toBe('Card declined');
    });

    it('shrugs at an unknown order', async () => {
      const { body } = await post(captured('order_does_not_exist')).expect(201);
      expect(body.handled).toBe(false);
    });

    it('does not double-process after the browser already confirmed', async () => {
      const order = await placeOrder('ONLINE');
      await http()
        .post(`/api/orders/${order.id}/payment/confirm`)
        .set(auth(token))
        .send({
          razorpayPaymentId: 'pay_first',
          razorpaySignature: gateway.signPayment(order.payment.razorpayOrderId, 'pay_first'),
        })
        .expect(201);

      const { body } = await post(captured(order.payment.razorpayOrderId)).expect(201);
      expect(body).toMatchObject({ handled: true, note: 'Already settled' });
    });
  });
});
