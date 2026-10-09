import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Step 8 end to end: a real order moved through the real state machine by the
 * real shop owner, with a real websocket listening. Covers the three failure
 * modes that would embarrass us in a demo — illegal transitions, one shop
 * touching another's order, and stock never coming back after a rejection.
 */
describe('Order status machine and realtime (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const stamp = Date.now();
  const customer = { email: `status.buyer.${stamp}@eplant.test`, password: 'Password123!' };

  let customerToken: string;
  let vendorAToken: string;
  let vendorBToken: string;
  let vendorAId: string;
  let productA: { id: string; vendorId: string };
  let productB: { id: string; vendorId: string };
  let originals: { id: string; stock: number }[] = [];
  let originalVendors: { id: string; minOrderValue: unknown }[] = [];
  const sockets: Socket[] = [];

  const address = {
    recipientName: 'Status Buyer',
    recipientPhone: '9800000101',
    addressLine1: '42 4th Cross, Koramangala',
    city: 'Bengaluru',
    pincode: '560034',
    deliveryLat: 12.9345,
    deliveryLng: 77.6268,
  };

  const http = () => request(app.getHttpServer());
  const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

  const login = async (email: string, password = 'Password123!') => {
    const { body } = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return body.accessToken as string;
  };

  /** Places a two-shop order and returns its vendor slices. */
  const placeOrder = async () => {
    await http().delete('/api/cart').set(auth(customerToken));
    await http()
      .post('/api/cart/items')
      .set(auth(customerToken))
      .send({ productId: productA.id, quantity: 1 })
      .expect(201);
    await http()
      .post('/api/cart/items')
      .set(auth(customerToken))
      .send({ productId: productB.id, quantity: 1 })
      .expect(201);

    const { body } = await http()
      .post('/api/orders/checkout')
      .set(auth(customerToken))
      .send(address)
      .expect(201);

    const slice = (vendorId: string) =>
      body.vendorOrders.find((v: { vendor: { id: string } }) => v.vendor.id === vendorId);

    return { master: body, a: slice(productA.vendorId), b: slice(productB.vendorId) };
  };

  const setStatus = (token: string, id: string, status: string, reason?: string) =>
    http()
      .patch(`/api/vendor/orders/${id}/status`)
      .set(auth(token))
      .send(reason ? { status, reason } : { status });

  /** Drives one slice from ORDERED to the requested state. */
  const advanceTo = async (token: string, id: string, target: string) => {
    const path = ['ACCEPTED', 'PACKING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    for (const status of path) {
      await setStatus(token, id, status).expect(200);
      if (status === target) return;
    }
  };

  const connect = async (token: string): Promise<Socket> => {
    const { body } = await http().post('/api/realtime/ticket').set(auth(token)).expect(201);

    const socket = io(`${baseUrl}/realtime`, {
      transports: ['websocket'],
      auth: { ticket: body.ticket },
      forceNew: true,
    });
    sockets.push(socket);

    await new Promise<void>((resolve, reject) => {
      socket.once('ready', () => resolve());
      socket.once('unauthorized', (payload: { message: string }) =>
        reject(new Error(payload.message)),
      );
      socket.once('connect_error', (error: Error) => reject(error));
      setTimeout(() => reject(new Error('socket did not become ready')), 5_000);
    });

    return socket;
  };

  /** Resolves with the next payload for `event`, or rejects on timeout. */
  const nextEvent = <T>(socket: Socket, event: string, timeoutMs = 5_000): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${event} within ${timeoutMs}ms`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // A real port, because the websocket tests need a real client.
    await app.listen(0);
    const address_ = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address_.port}`;

    prisma = app.get(PrismaService);

    await http()
      .post('/api/auth/register')
      .send({ ...customer, name: 'Status Buyer', phone: '+919800000101' })
      .expect(201);
    customerToken = await login(customer.email);

    const [first, second] = await prisma.product.findMany({
      where: { active: true, stock: { gt: 3 }, vendor: { approved: true, suspended: false } },
      distinct: ['vendorId'],
      orderBy: { price: 'asc' },
      select: { id: true, vendorId: true },
      take: 2,
    });
    productA = first;
    productB = second;
    vendorAId = first.vendorId;

    const owners = await prisma.vendor.findMany({
      where: { id: { in: [productA.vendorId, productB.vendorId] } },
      select: { id: true, user: { select: { email: true } } },
    });
    const emailOf = (vendorId: string) => owners.find((o) => o.id === vendorId)!.user.email;

    vendorAToken = await login(emailOf(productA.vendorId));
    vendorBToken = await login(emailOf(productB.vendorId));

    originals = await prisma.product.findMany({
      where: { id: { in: [productA.id, productB.id] } },
      select: { id: true, stock: true },
    });
    originalVendors = await prisma.vendor.findMany({
      where: { id: { in: [productA.vendorId, productB.vendorId] } },
      select: { id: true, minOrderValue: true },
    });
    await prisma.vendor.updateMany({
      where: { id: { in: [productA.vendorId, productB.vendorId] } },
      data: { minOrderValue: 0 },
    });
    // Every test in this suite places an order; give the shelf enough stock to
    // survive the whole run (restored in afterAll).
    await prisma.product.updateMany({
      where: { id: { in: [productA.id, productB.id] } },
      data: { stock: 500 },
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();

    await prisma.masterOrder.deleteMany({ where: { customer: { email: customer.email } } });
    await prisma.user.deleteMany({ where: { email: customer.email } });

    for (const product of originals) {
      await prisma.product.update({ where: { id: product.id }, data: { stock: product.stock } });
    }
    for (const vendor of originalVendors) {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { minOrderValue: vendor.minOrderValue as never },
      });
    }

    await app.close();
  });

  describe('vendor order queue', () => {
    it('shows the shop only its own slice of a split order', async () => {
      const { a } = await placeOrder();

      const { body } = await http().get('/api/vendor/orders').set(auth(vendorAToken)).expect(200);
      const ids = body.items.map((item: { id: string }) => item.id);

      expect(ids).toContain(a.id);
      expect(
        body.items.every((item: { vendor: { id: string } }) => item.vendor.id === vendorAId),
      ).toBe(true);
    });

    it('starts a new slice at ORDERED and offers only the legal next moves', async () => {
      const { a } = await placeOrder();
      const { body } = await http()
        .get(`/api/vendor/orders/${a.id}`)
        .set(auth(vendorAToken))
        .expect(200);

      expect(body.status).toBe('ORDERED');
      expect(body.allowedNext).toEqual(['ACCEPTED', 'REJECTED']);
    });

    it('includes the delivery address the shop needs', async () => {
      const { a } = await placeOrder();
      const { body } = await http()
        .get(`/api/vendor/orders/${a.id}`)
        .set(auth(vendorAToken))
        .expect(200);

      expect(body.masterOrder).toMatchObject({
        recipientName: address.recipientName,
        pincode: address.pincode,
      });
      expect(body.items.length).toBeGreaterThan(0);
    });

    it('filters by status', async () => {
      const { a } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(200);

      const { body } = await http()
        .get('/api/vendor/orders?status=ACCEPTED')
        .set(auth(vendorAToken))
        .expect(200);

      expect(body.items.every((item: { status: string }) => item.status === 'ACCEPTED')).toBe(true);
      expect(body.items.map((item: { id: string }) => item.id)).toContain(a.id);
    });

    it('reports dashboard counts', async () => {
      const { body } = await http()
        .get('/api/vendor/orders/stats')
        .set(auth(vendorAToken))
        .expect(200);

      expect(body).toEqual(
        expect.objectContaining({
          newOrders: expect.any(Number),
          inProgress: expect.any(Number),
          delivered: expect.any(Number),
          rejected: expect.any(Number),
          revenue: expect.any(String),
        }),
      );
    });

    it('is closed to customers', async () => {
      await http().get('/api/vendor/orders').set(auth(customerToken)).expect(403);
    });
  });

  describe('transitions', () => {
    it('walks the whole happy path', async () => {
      const { a } = await placeOrder();

      for (const status of ['ACCEPTED', 'PACKING', 'READY_FOR_PICKUP']) {
        const { body } = await setStatus(vendorAToken, a.id, status).expect(200);
        expect(body.status).toBe(status);
      }

      const { body } = await setStatus(vendorAToken, a.id, 'OUT_FOR_DELIVERY').expect(200);
      expect(body.status).toBe('OUT_FOR_DELIVERY');
      expect(body.allowedNext).toEqual(['DELIVERED']);
    });

    it('refuses to skip a step', async () => {
      const { a } = await placeOrder();
      const { body } = await setStatus(vendorAToken, a.id, 'OUT_FOR_DELIVERY').expect(400);

      expect(body.message).toMatch(/Cannot go from/);
      const after = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: a.id } });
      expect(after.status).toBe('ORDERED');
    });

    it('refuses to go backwards', async () => {
      const { a } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(200);
      await setStatus(vendorAToken, a.id, 'ORDERED').expect(400);
    });

    it('refuses to repeat the current status', async () => {
      const { a } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(200);

      const { body } = await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(400);
      expect(body.message).toMatch(/already/i);
    });

    it('rejects an unknown status outright', async () => {
      const { a } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'TELEPORTED').expect(400);
    });

    it('stamps acceptedAt and deliveredAt', async () => {
      const { a } = await placeOrder();
      await advanceTo(vendorAToken, a.id, 'DELIVERED');

      const row = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.acceptedAt).toBeInstanceOf(Date);
      expect(row.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('ownership', () => {
    it('stops one shop advancing another shop’s order', async () => {
      const { a } = await placeOrder();
      await setStatus(vendorBToken, a.id, 'ACCEPTED').expect(403);

      const after = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: a.id } });
      expect(after.status).toBe('ORDERED');
    });

    it('hides another shop’s order from the detail endpoint', async () => {
      const { a } = await placeOrder();
      await http().get(`/api/vendor/orders/${a.id}`).set(auth(vendorBToken)).expect(404);
    });

    it('404s on a well-formed but unknown id', async () => {
      await http()
        .get('/api/vendor/orders/00000000-0000-4000-8000-000000000000')
        .set(auth(vendorAToken))
        .expect(404);
    });
  });

  describe('rejection', () => {
    it('demands a reason', async () => {
      const { a } = await placeOrder();
      const { body } = await setStatus(vendorAToken, a.id, 'REJECTED').expect(400);
      expect(String(body.message)).toMatch(/why/i);
    });

    it('returns the stock to the shelf and records the reason', async () => {
      const before = (await prisma.product.findUniqueOrThrow({ where: { id: productA.id } })).stock;
      const { a } = await placeOrder();

      const during = (await prisma.product.findUniqueOrThrow({ where: { id: productA.id } })).stock;
      expect(during).toBe(before - 1);

      await setStatus(vendorAToken, a.id, 'REJECTED', 'Last one was damaged').expect(200);

      const after = (await prisma.product.findUniqueOrThrow({ where: { id: productA.id } })).stock;
      expect(after).toBe(before);

      const row = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.rejectionReason).toBe('Last one was damaged');
    });

    it('cannot reject once the order has left the shop', async () => {
      const { a } = await placeOrder();
      await advanceTo(vendorAToken, a.id, 'OUT_FOR_DELIVERY');
      await setStatus(vendorAToken, a.id, 'REJECTED', 'Changed my mind').expect(400);
    });
  });

  describe('master status is derived from its shops', () => {
    it('stays PLACED while one shop is still working', async () => {
      const { master, a } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(200);

      const row = await prisma.masterOrder.findUniqueOrThrow({ where: { id: master.id } });
      expect(row.status).toBe('PLACED');
    });

    it('completes once every shop delivered', async () => {
      const { master, a, b } = await placeOrder();
      await advanceTo(vendorAToken, a.id, 'DELIVERED');
      await advanceTo(vendorBToken, b.id, 'DELIVERED');

      const row = await prisma.masterOrder.findUniqueOrThrow({ where: { id: master.id } });
      expect(row.status).toBe('COMPLETED');
    });

    it('is partially fulfilled when one shop rejects and the other delivers', async () => {
      const { master, a, b } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'REJECTED', 'Out of stock').expect(200);
      await advanceTo(vendorBToken, b.id, 'DELIVERED');

      const row = await prisma.masterOrder.findUniqueOrThrow({ where: { id: master.id } });
      expect(row.status).toBe('PARTIALLY_FULFILLED');
    });

    it('cancels when every shop rejects', async () => {
      const { master, a, b } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'REJECTED', 'Closed today').expect(200);
      await setStatus(vendorBToken, b.id, 'REJECTED', 'Closed today').expect(200);

      const row = await prisma.masterOrder.findUniqueOrThrow({ where: { id: master.id } });
      expect(row.status).toBe('CANCELLED');
    });

    it('is visible to the customer on their own order', async () => {
      const { master, a } = await placeOrder();
      await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(200);

      const { body } = await http()
        .get(`/api/orders/${master.id}`)
        .set(auth(customerToken))
        .expect(200);

      const slice = body.vendorOrders.find((v: { id: string }) => v.id === a.id);
      expect(slice.status).toBe('ACCEPTED');
    });
  });

  describe('realtime', () => {
    it('issues a short-lived ticket to an authenticated caller', async () => {
      const { body } = await http()
        .post('/api/realtime/ticket')
        .set(auth(customerToken))
        .expect(201);

      expect(body.ticket).toEqual(expect.any(String));
      expect(body.expiresIn).toBeGreaterThan(0);
    });

    it('refuses to issue a ticket to an anonymous caller', async () => {
      await http().post('/api/realtime/ticket').expect(401);
    });

    it('rejects a handshake with no ticket', async () => {
      const socket = io(`${baseUrl}/realtime`, { transports: ['websocket'], forceNew: true });
      sockets.push(socket);

      const message = await new Promise<string>((resolve) => {
        socket.once('unauthorized', (payload: { message: string }) => resolve(payload.message));
      });

      expect(message).toMatch(/ticket/i);
    });

    it('rejects a replayed ticket, because tickets are single use', async () => {
      const { body } = await http()
        .post('/api/realtime/ticket')
        .set(auth(customerToken))
        .expect(201);

      const first = io(`${baseUrl}/realtime`, {
        transports: ['websocket'],
        auth: { ticket: body.ticket },
        forceNew: true,
      });
      sockets.push(first);
      await new Promise<void>((resolve) => first.once('ready', () => resolve()));

      const replay = io(`${baseUrl}/realtime`, {
        transports: ['websocket'],
        auth: { ticket: body.ticket },
        forceNew: true,
      });
      sockets.push(replay);

      const message = await new Promise<string>((resolve) => {
        replay.once('unauthorized', (payload: { message: string }) => resolve(payload.message));
      });
      expect(message).toMatch(/ticket/i);
    });

    it('pushes a status change to the watching customer', async () => {
      const { master, a } = await placeOrder();
      const socket = await connect(customerToken);

      const watching = await socket.emitWithAck('watchOrder', { masterOrderId: master.id });
      expect(watching).toEqual({ watching: true });

      const event = nextEvent<{ status: string; vendorOrderId: string }>(socket, 'order.status');
      await setStatus(vendorAToken, a.id, 'ACCEPTED').expect(200);

      await expect(event).resolves.toMatchObject({
        vendorOrderId: a.id,
        status: 'ACCEPTED',
        previousStatus: 'ORDERED',
        statusLabel: 'Accepted',
      });
    });

    it('will not let a customer watch an order that is not theirs', async () => {
      const socket = await connect(customerToken);
      const other = await prisma.masterOrder.findFirst({
        where: { customer: { email: { not: customer.email } } },
        select: { id: true },
      });

      if (!other) return; // no foreign order in this database; nothing to prove

      await expect(socket.emitWithAck('watchOrder', { masterOrderId: other.id })).resolves.toEqual({
        watching: false,
        reason: 'Not your order',
      });
    });

    it('rings the shop when a new order lands', async () => {
      const socket = await connect(vendorAToken);
      const event = nextEvent<{ orderNumber: string }>(socket, 'order.created');

      const { a } = await placeOrder();

      await expect(event).resolves.toMatchObject({ vendorOrderId: a.id });
    });
  });
});
