import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Real database, real transactions. These are the tests that matter for this
 * step: an order either exists completely or not at all, stock is never
 * oversold, and two customers racing for the last plant cannot both win.
 */
describe('Cart and multi-vendor checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const customer = { email: `buyer.${stamp}@eplant.test`, password: 'Password123!' };
  const rival = { email: `rival.${stamp}@eplant.test`, password: 'Password123!' };

  let token: string;
  let rivalToken: string;
  /** One in-stock product from each of two different vendors. */
  let productA: { id: string; vendorId: string; price: string };
  let productB: { id: string; vendorId: string; price: string };
  /** Seed values, restored afterwards so other suites see an untouched catalogue. */
  let originals: { id: string; title: string; price: unknown; stock: number; active: boolean }[];
  let originalVendors: { id: string; minOrderValue: unknown }[];

  const address = {
    recipientName: 'Test Buyer',
    recipientPhone: '9800000101',
    addressLine1: '42 4th Cross, Koramangala',
    city: 'Bengaluru',
    pincode: '560034',
  };

  const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });
  const http = () => request(app.getHttpServer());

  const register = async (credentials: { email: string; password: string }) => {
    const { body } = await http()
      .post('/api/auth/register')
      .send({ ...credentials, name: 'Test Buyer', phone: '+919800000101' })
      .expect(201);
    return body.accessToken as string;
  };

  const addToCart = (bearer: string, productId: string, quantity: number) =>
    http().post('/api/cart/items').set(auth(bearer)).send({ productId, quantity });

  const checkout = (bearer: string, body: Record<string, unknown> = address) =>
    http().post('/api/orders/checkout').set(auth(bearer)).send(body);

  const stockOf = async (productId: string): Promise<number> => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stock: true },
    });
    return product.stock;
  };

  const setStock = (productId: string, stock: number) =>
    prisma.product.update({ where: { id: productId }, data: { stock } });

  const countOrders = async () => prisma.masterOrder.count();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    token = await register(customer);
    rivalToken = await register(rival);

    // Two products from two different approved vendors, so the split is real.
    const [first, second] = await prisma.product.findMany({
      where: { active: true, stock: { gt: 0 }, vendor: { approved: true, suspended: false } },
      distinct: ['vendorId'],
      orderBy: { price: 'asc' },
      select: { id: true, vendorId: true, price: true },
      take: 2,
    });

    productA = { ...first, price: first.price.toString() };
    productB = { ...second, price: second.price.toString() };

    originals = await prisma.product.findMany({
      where: { id: { in: [productA.id, productB.id] } },
      select: { id: true, title: true, price: true, stock: true, active: true },
    });
    originalVendors = await prisma.vendor.findMany({
      where: { id: { in: [productA.vendorId, productB.vendorId] } },
      select: { id: true, minOrderValue: true },
    });

    // Minimum order values would otherwise block these small test carts.
    await prisma.vendor.updateMany({
      where: { id: { in: [productA.vendorId, productB.vendorId] } },
      data: { minOrderValue: 0 },
    });
  });

  afterAll(async () => {
    // Orders reference the customer with ON DELETE RESTRICT — on purpose, so a
    // user with history cannot silently vanish. Remove the orders first.
    await prisma.masterOrder.deleteMany({
      where: { customer: { email: { in: [customer.email, rival.email] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [customer.email, rival.email] } } });

    for (const product of originals) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          title: product.title,
          price: product.price as never,
          stock: product.stock,
          active: product.active,
        },
      });
    }
    for (const vendor of originalVendors) {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { minOrderValue: vendor.minOrderValue as never },
      });
    }

    await app.close();
  });

  beforeEach(async () => {
    await http().delete('/api/cart').set(auth(token));
    await http().delete('/api/cart').set(auth(rivalToken));
  });

  describe('cart behaviour', () => {
    it('starts empty and is not checkout-ready', async () => {
      const { body } = await http().get('/api/cart').set(auth(token)).expect(200);

      expect(body.vendorGroups).toEqual([]);
      expect(body.grandTotal).toBe('0.00');
      expect(body.checkoutReady).toBe(false);
    });

    it('groups lines by vendor with one delivery fee per shop', async () => {
      await addToCart(token, productA.id, 2).expect(201);
      const { body } = await addToCart(token, productB.id, 1).expect(201);

      expect(body.vendorGroups).toHaveLength(2);

      const expectedItems = Number(productA.price) * 2 + Number(productB.price);
      expect(Number(body.itemsTotal)).toBeCloseTo(expectedItems, 2);
      expect(Number(body.grandTotal)).toBeCloseTo(
        Number(body.itemsTotal) + Number(body.deliveryTotal),
        2,
      );
      expect(body.checkoutReady).toBe(true);
    });

    it('tops up an existing line rather than duplicating it', async () => {
      await addToCart(token, productA.id, 1).expect(201);
      const { body } = await addToCart(token, productA.id, 2).expect(201);

      expect(body.lineCount).toBe(1);
      expect(body.itemCount).toBe(3);
    });

    it('refuses to add more than the shop has in stock', async () => {
      const stock = await stockOf(productA.id);
      const { body } = await addToCart(token, productA.id, stock + 5).expect(400);

      expect(String(body.message)).toMatch(/only|exceed/i);
    });

    it('rejects a quantity of zero or a bad product id', async () => {
      await addToCart(token, productA.id, 0).expect(400);
      await http()
        .post('/api/cart/items')
        .set(auth(token))
        .send({ productId: 'not-a-uuid', quantity: 1 })
        .expect(400);
    });

    it('cannot touch another customer’s cart line', async () => {
      const { body } = await addToCart(token, productA.id, 1).expect(201);
      const lineId = body.vendorGroups[0].lines[0].id;

      await http()
        .patch(`/api/cart/items/${lineId}`)
        .set(auth(rivalToken))
        .send({ quantity: 5 })
        .expect(404);
      await http().delete(`/api/cart/items/${lineId}`).set(auth(rivalToken)).expect(404);
    });

    it('requires a login', async () => {
      await http().get('/api/cart').expect(401);
    });
  });

  describe('the multi-vendor split', () => {
    it('creates one master order and one vendor order per shop', async () => {
      await addToCart(token, productA.id, 2);
      await addToCart(token, productB.id, 1);

      const { body } = await checkout(token).expect(201);

      expect(body.orderNumber).toMatch(/^EP-\d{6}-[0-9A-F]{6}$/);
      expect(body.status).toBe('PLACED');
      expect(body.vendorOrders).toHaveLength(2);
      expect(body.vendorOrders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
        `${body.orderNumber}-V1`,
        `${body.orderNumber}-V2`,
      ]);
      expect(body.vendorOrders.every((o: { status: string }) => o.status === 'ORDERED')).toBe(true);
    });

    it('master totals equal the sum of the vendor orders', async () => {
      await addToCart(token, productA.id, 2);
      await addToCart(token, productB.id, 1);

      const { body } = await checkout(token).expect(201);

      const sum = body.vendorOrders.reduce(
        (total: number, order: { total: string }) => total + Number(order.total),
        0,
      );
      expect(Number(body.grandTotal)).toBeCloseTo(sum, 2);
    });

    it('decrements stock by exactly the quantity ordered', async () => {
      const before = await stockOf(productA.id);

      await addToCart(token, productA.id, 3);
      await checkout(token).expect(201);

      expect(await stockOf(productA.id)).toBe(before - 3);
    });

    it('empties the cart', async () => {
      await addToCart(token, productA.id, 1);
      await checkout(token).expect(201);

      const { body } = await http().get('/api/cart').set(auth(token)).expect(200);
      expect(body.lineCount).toBe(0);
    });

    it('snapshots the item details so later edits cannot rewrite history', async () => {
      await addToCart(token, productA.id, 1);
      const { body } = await checkout(token).expect(201);
      const item = body.vendorOrders[0].items[0];

      await prisma.product.update({
        where: { id: productA.id },
        data: { title: 'RENAMED AFTER THE ORDER', price: 99999 },
      });

      const { body: reread } = await http()
        .get(`/api/orders/${body.id}`)
        .set(auth(token))
        .expect(200);

      expect(reread.vendorOrders[0].items[0].productTitle).toBe(item.productTitle);
      expect(reread.vendorOrders[0].items[0].unitPrice).toBe(item.unitPrice);
    });

    it('rejects an invalid address without creating anything', async () => {
      await addToCart(token, productA.id, 1);
      const before = await countOrders();

      await checkout(token, { ...address, pincode: '12' }).expect(400);
      await checkout(token, { ...address, recipientPhone: '12345' }).expect(400);

      expect(await countOrders()).toBe(before);
    });

    it('refuses an empty cart', async () => {
      await checkout(token).expect(400);
    });
  });

  describe('rollback: nothing is half-written', () => {
    it('leaves stock, cart and orders untouched when one line sold out', async () => {
      await addToCart(token, productA.id, 1);
      await addToCart(token, productB.id, 1);

      // Someone else buys the last of product B after it was added to the cart.
      const restoreB = await stockOf(productB.id);
      await setStock(productB.id, 0);

      const stockABefore = await stockOf(productA.id);
      const ordersBefore = await countOrders();

      const { body } = await checkout(token).expect(409);
      expect(body.problems).toEqual([
        expect.objectContaining({
          productId: productB.id,
          reason: expect.stringMatching(/sold out/i),
        }),
      ]);

      // The *other* vendor's stock must not have been reserved.
      expect(await stockOf(productA.id)).toBe(stockABefore);
      expect(await countOrders()).toBe(ordersBefore);

      const { body: cart } = await http().get('/api/cart').set(auth(token)).expect(200);
      expect(cart.lineCount).toBe(2);

      await setStock(productB.id, restoreB);
    });

    it('rolls back when a product is de-listed mid-checkout', async () => {
      await addToCart(token, productA.id, 1);
      await addToCart(token, productB.id, 1);

      await prisma.product.update({ where: { id: productB.id }, data: { active: false } });
      const stockABefore = await stockOf(productA.id);
      const ordersBefore = await countOrders();

      await checkout(token).expect(409);

      expect(await stockOf(productA.id)).toBe(stockABefore);
      expect(await countOrders()).toBe(ordersBefore);

      await prisma.product.update({ where: { id: productB.id }, data: { active: true } });
    });

    it('rolls back when a shop is suspended mid-checkout', async () => {
      await addToCart(token, productA.id, 1);
      await prisma.vendor.update({
        where: { id: productA.vendorId },
        data: { suspended: true },
      });

      const ordersBefore = await countOrders();
      await checkout(token).expect(409);
      expect(await countOrders()).toBe(ordersBefore);

      await prisma.vendor.update({ where: { id: productA.vendorId }, data: { suspended: false } });
    });

    it('reports every problem in one response', async () => {
      await addToCart(token, productA.id, 2);
      await addToCart(token, productB.id, 2);
      await setStock(productA.id, 0);
      await setStock(productB.id, 0);

      const { body } = await checkout(token).expect(409);
      expect(body.problems).toHaveLength(2);

      await setStock(productA.id, 20);
      await setStock(productB.id, 20);
    });

    it('enforces the vendor minimum order value', async () => {
      await prisma.vendor.update({
        where: { id: productA.vendorId },
        data: { minOrderValue: 100000 },
      });

      await addToCart(token, productA.id, 1);
      const ordersBefore = await countOrders();

      const { body } = await checkout(token).expect(409);
      expect(String(JSON.stringify(body.problems))).toMatch(/minimum/i);
      expect(await countOrders()).toBe(ordersBefore);

      await prisma.vendor.update({ where: { id: productA.vendorId }, data: { minOrderValue: 0 } });
    });
  });

  describe('concurrency: the last plant on the shelf', () => {
    it('lets exactly one of two simultaneous checkouts win', async () => {
      await setStock(productA.id, 1);

      await addToCart(token, productA.id, 1);
      await addToCart(rivalToken, productA.id, 1);

      const ordersBefore = await countOrders();

      // Both requests are in flight before either transaction commits.
      const [first, second] = await Promise.all([
        checkout(token).then((response) => response.status),
        checkout(rivalToken).then((response) => response.status),
      ]);

      const statuses = [first, second].sort();
      expect(statuses).toEqual([201, 409]);

      // One unit sold, one order created, never a negative stock.
      expect(await stockOf(productA.id)).toBe(0);
      expect(await countOrders()).toBe(ordersBefore + 1);

      await setStock(productA.id, 20);
    });

    it('never oversells under a burst of concurrent buyers', async () => {
      await setStock(productA.id, 3);
      await addToCart(token, productA.id, 1);

      // The same customer fires five checkouts of a one-item cart at once.
      // Only the first can succeed: the rest find an empty cart or no stock.
      const results = await Promise.all(
        Array.from({ length: 5 }, () => checkout(token).then((response) => response.status)),
      );

      expect(results.filter((status) => status === 201)).toHaveLength(1);
      expect(await stockOf(productA.id)).toBeGreaterThanOrEqual(0);
      expect(await stockOf(productA.id)).toBe(2);

      await setStock(productA.id, 20);
    });
  });

  describe('order history', () => {
    it('lists the customer’s own orders, newest first', async () => {
      await addToCart(token, productA.id, 1);
      await checkout(token).expect(201);

      const { body } = await http().get('/api/orders').set(auth(token)).expect(200);

      expect(body.total).toBeGreaterThan(0);
      const dates = body.items.map((order: { placedAt: string }) => Date.parse(order.placedAt));
      expect([...dates].sort((a: number, b: number) => b - a)).toEqual(dates);
    });

    it('never shows another customer’s order', async () => {
      await addToCart(token, productA.id, 1);
      const { body } = await checkout(token).expect(201);

      await http().get(`/api/orders/${body.id}`).set(auth(rivalToken)).expect(404);

      const { body: rivalList } = await http().get('/api/orders').set(auth(rivalToken)).expect(200);
      expect(rivalList.items.some((order: { id: string }) => order.id === body.id)).toBe(false);
    });
  });
});
