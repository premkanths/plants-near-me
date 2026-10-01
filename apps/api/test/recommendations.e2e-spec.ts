import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { LlmGateway } from '../src/recommendations/llm.gateway';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Step 12 end to end. The behaviour that matters: anonymous visitors get
 * sensible popular picks, signed-in buyers get something shaped by their
 * history, nothing out of stock or already owned is ever suggested, and the
 * LLM layer is strictly optional.
 */
describe('Recommendations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const buyer = { email: `rec.buyer.${stamp}@eplant.test`, password: 'Password123!' };

  let buyerToken: string;
  let vendorToken: string;
  let boughtProduct: { id: string; plantId: string; vendorId: string };
  let originalStock: number;
  let originalMin: unknown;

  const http = () => request(app.getHttpServer());
  const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

  const login = async (email: string, password = 'Password123!') => {
    const { body } = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await http()
      .post('/api/auth/register')
      .send({ ...buyer, name: 'Rec Buyer', phone: '+919800000141' })
      .expect(201);
    buyerToken = await login(buyer.email);

    const found = await prisma.product.findFirstOrThrow({
      where: { active: true, stock: { gt: 3 }, vendor: { approved: true, suspended: false } },
      select: {
        id: true,
        plantId: true,
        vendorId: true,
        stock: true,
        vendor: { select: { minOrderValue: true, user: { select: { email: true } } } },
      },
    });
    boughtProduct = { id: found.id, plantId: found.plantId, vendorId: found.vendorId };
    originalStock = found.stock;
    originalMin = found.vendor.minOrderValue;
    vendorToken = await login(found.vendor.user.email);

    await prisma.vendor.update({ where: { id: found.vendorId }, data: { minOrderValue: 0 } });
    await prisma.product.update({ where: { id: found.id }, data: { stock: 500 } });
  });

  afterAll(async () => {
    await prisma.masterOrder.deleteMany({ where: { customer: { email: buyer.email } } });
    await prisma.user.deleteMany({ where: { email: buyer.email } });
    await prisma.product.update({
      where: { id: boughtProduct.id },
      data: { stock: originalStock },
    });
    await prisma.vendor.update({
      where: { id: boughtProduct.vendorId },
      data: { minOrderValue: originalMin as never },
    });
    await app.close();
  });

  describe('anonymous visitors', () => {
    it('gets popular picks without logging in', async () => {
      const { body } = await http().get('/api/recommendations').expect(200);

      expect(body.strategy).toBe('popular');
      expect(body.personalised).toBe(false);
      expect(body.items.length).toBeGreaterThan(0);
    });

    it('explains every pick', async () => {
      const { body } = await http().get('/api/recommendations?limit=5').expect(200);

      for (const item of body.items) {
        expect(item.reasons.length).toBeGreaterThan(0);
        expect(item.reasons.length).toBeLessThanOrEqual(3);
      }
    });

    it('honours the limit', async () => {
      const { body } = await http().get('/api/recommendations?limit=3').expect(200);

      expect(body.items).toHaveLength(3);
    });

    it('rejects a silly limit instead of melting the database', async () => {
      await http().get('/api/recommendations?limit=500').expect(400);
      await http().get('/api/recommendations?limit=0').expect(400);
    });

    it('rejects a malformed location', async () => {
      await http().get('/api/recommendations?lat=999&lng=77').expect(400);
    });

    it('never suggests anything out of stock', async () => {
      const { body } = await http().get('/api/recommendations?limit=24').expect(200);

      expect(body.items.every((item: { stock: number }) => item.stock > 0)).toBe(true);
    });

    it('shows at most one listing per species', async () => {
      const { body } = await http().get('/api/recommendations?limit=24').expect(200);

      const plantIds = body.items.map((item: { plant: { id: string } }) => item.plant.id);
      expect(new Set(plantIds).size).toBe(plantIds.length);
    });

    it('does not let one shop take over the page', async () => {
      const { body } = await http().get('/api/recommendations?limit=24').expect(200);

      const counts = new Map<string, number>();
      for (const item of body.items as { vendor: { id: string } }[]) {
        counts.set(item.vendor.id, (counts.get(item.vendor.id) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    });

    it('adds distance when a location is shared', async () => {
      const { body } = await http()
        .get('/api/recommendations?lat=12.9716&lng=77.5946&limit=5')
        .expect(200);

      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(typeof item.distanceKm).toBe('number');
      }
    });

    it('leaves distance null when no location is shared', async () => {
      const { body } = await http().get('/api/recommendations?limit=5').expect(200);

      expect(body.items[0].distanceKm).toBeNull();
    });

    it('reports money as a fixed-point string', async () => {
      const { body } = await http().get('/api/recommendations?limit=1').expect(200);

      expect(body.items[0].price).toMatch(/^\d+\.\d{2}$/);
    });
  });

  describe('a customer with history', () => {
    beforeAll(async () => {
      await http().delete('/api/cart').set(auth(buyerToken));
      await http()
        .post('/api/cart/items')
        .set(auth(buyerToken))
        .send({ productId: boughtProduct.id, quantity: 1 })
        .expect(201);

      const { body: order } = await http()
        .post('/api/orders/checkout')
        .set(auth(buyerToken))
        .send({
          recipientName: 'Rec Buyer',
          recipientPhone: '9800000141',
          addressLine1: '7 Residency Road',
          city: 'Bengaluru',
          pincode: '560025',
        })
        .expect(201);

      for (const status of [
        'ACCEPTED',
        'PACKING',
        'READY_FOR_PICKUP',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
      ]) {
        await http()
          .patch(`/api/vendor/orders/${order.vendorOrders[0].id}/status`)
          .set(auth(vendorToken))
          .send({ status })
          .expect(200);
      }
    });

    it('switches to the personalised strategy', async () => {
      const { body } = await http().get('/api/recommendations').set(auth(buyerToken)).expect(200);

      expect(body.strategy).toBe('personalised');
      expect(body.personalised).toBe(true);
      expect(body.basedOn).toBeGreaterThan(0);
    });

    it('never recommends a plant the customer already bought', async () => {
      const { body } = await http()
        .get('/api/recommendations?limit=24')
        .set(auth(buyerToken))
        .expect(200);

      expect(
        body.items.some(
          (item: { plant: { id: string } }) => item.plant.id === boughtProduct.plantId,
        ),
      ).toBe(false);
    });

    it('still serves the anonymous list on the same URL without a token', async () => {
      const { body } = await http().get('/api/recommendations').expect(200);

      expect(body.personalised).toBe(false);
    });

    it('ignores a junk token on the public route rather than erroring', async () => {
      const { body } = await http()
        .get('/api/recommendations')
        .set({ Authorization: 'Bearer not-a-real-token' })
        .expect(200);

      expect(body.personalised).toBe(false);
    });
  });

  describe('more like this', () => {
    it('returns similar plants for a listing', async () => {
      const { body } = await http()
        .get(`/api/recommendations/similar/${boughtProduct.id}?limit=4`)
        .expect(200);

      expect(body.seed.productId).toBe(boughtProduct.id);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.length).toBeLessThanOrEqual(4);
    });

    it('never returns the seed plant itself', async () => {
      const { body } = await http()
        .get(`/api/recommendations/similar/${boughtProduct.id}?limit=12`)
        .expect(200);

      expect(
        body.items.every(
          (item: { plant: { id: string } }) => item.plant.id !== boughtProduct.plantId,
        ),
      ).toBe(true);
    });

    it('404s for a listing that does not exist', async () => {
      await http()
        .get('/api/recommendations/similar/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });

    it('rejects an id that is not a uuid', async () => {
      await http().get('/api/recommendations/similar/not-a-uuid').expect(400);
    });
  });

  describe('the LLM layer is optional', () => {
    it('is reported as off when no API key is configured', async () => {
      const { body } = await http().get('/api/recommendations?explain=true').expect(200);

      expect(app.get(LlmGateway).available).toBe(false);
      expect(body.llm).toBe(false);
      // Rule-based reasons still arrive, which is the whole point.
      expect(body.items[0].reasons.length).toBeGreaterThan(0);
      expect(body.items[0].blurb).toBeUndefined();
    });
  });
});
