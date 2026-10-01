import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Step 10 end to end. The rule under test is "only a buyer of a delivered
 * order may review, and only once" — plus the rolling averages on the shop and
 * the listing, which are what the rest of the app reads.
 */
describe('Reviews (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const buyer = { email: `reviewer.${stamp}@eplant.test`, password: 'Password123!' };
  const stranger = { email: `stranger.${stamp}@eplant.test`, password: 'Password123!' };

  let buyerToken: string;
  let strangerToken: string;
  let vendorToken: string;
  let product: { id: string; vendorId: string };
  let vendorSlug: string;
  let originalStock: number;
  let originalMin: unknown;
  let originalRating: { avg: number; count: number };

  const address = {
    recipientName: 'Review Test',
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

  /** Buys the product and optionally walks the order all the way to delivered. */
  const buy = async (deliver = true) => {
    await http().delete('/api/cart').set(auth(buyerToken));
    await http()
      .post('/api/cart/items')
      .set(auth(buyerToken))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

    const { body: order } = await http()
      .post('/api/orders/checkout')
      .set(auth(buyerToken))
      .send(address)
      .expect(201);

    const slice = order.vendorOrders[0];
    if (deliver) {
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
    }
    return slice as { id: string; orderNumber: string };
  };

  const review = (body: Record<string, unknown>, bearer = buyerToken) =>
    http().post('/api/reviews').set(auth(bearer)).send(body);

  const vendorRow = () =>
    prisma.vendor.findUniqueOrThrow({
      where: { id: product.vendorId },
      select: { ratingAvg: true, ratingCount: true },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    for (const account of [buyer, stranger]) {
      await http()
        .post('/api/auth/register')
        .send({ ...account, name: 'Review Test', phone: '+919800000101' })
        .expect(201);
    }
    buyerToken = await login(buyer.email);
    strangerToken = await login(stranger.email);

    const found = await prisma.product.findFirstOrThrow({
      where: { active: true, stock: { gt: 3 }, vendor: { approved: true, suspended: false } },
      select: { id: true, vendorId: true, stock: true },
    });
    product = { id: found.id, vendorId: found.vendorId };
    originalStock = found.stock;

    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: product.vendorId },
      select: {
        slug: true,
        minOrderValue: true,
        ratingAvg: true,
        ratingCount: true,
        user: { select: { email: true } },
      },
    });
    vendorSlug = vendor.slug;
    originalMin = vendor.minOrderValue;
    originalRating = { avg: vendor.ratingAvg, count: vendor.ratingCount };
    vendorToken = await login(vendor.user.email);

    await prisma.vendor.update({ where: { id: product.vendorId }, data: { minOrderValue: 0 } });
    await prisma.product.update({ where: { id: product.id }, data: { stock: 500 } });
  });

  afterAll(async () => {
    await prisma.masterOrder.deleteMany({
      where: { customer: { email: { in: [buyer.email, stranger.email] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [buyer.email, stranger.email] } } });
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: originalStock, ratingAvg: 0, ratingCount: 0 },
    });
    await prisma.vendor.update({
      where: { id: product.vendorId },
      data: {
        minOrderValue: originalMin as never,
        ratingAvg: originalRating.avg,
        ratingCount: originalRating.count,
      },
    });
    await app.close();
  });

  describe('earning the right to review', () => {
    it('rejects a review for an order that was never delivered', async () => {
      const slice = await buy(false);
      const { body } = await review({ vendorOrderId: slice.id, rating: 5 }).expect(400);
      expect(body.message).toMatch(/delivered/i);
    });

    it('rejects a review from someone who did not buy', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 5 }, strangerToken).expect(404);
    });

    it('rejects an anonymous review', async () => {
      const slice = await buy();
      await http().post('/api/reviews').send({ vendorOrderId: slice.id, rating: 5 }).expect(401);
    });

    it('accepts a review once the order is delivered', async () => {
      const slice = await buy();
      const { body } = await review({
        vendorOrderId: slice.id,
        rating: 5,
        comment: 'Arrived in perfect condition',
      }).expect(201);

      expect(body).toMatchObject({ rating: 5, comment: 'Arrived in perfect condition' });
      expect(body.author.name).toEqual(expect.any(String));
    });

    it('allows only one review per order', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 4 }).expect(201);
      await review({ vendorOrderId: slice.id, rating: 1 }).expect(409);
    });
  });

  describe('validation', () => {
    it('rejects a rating outside 1–5', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 0 }).expect(400);
      await review({ vendorOrderId: slice.id, rating: 6 }).expect(400);
    });

    it('rejects a non-numeric rating', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 'five' }).expect(400);
    });

    it('rejects an over-long comment', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 5, comment: 'x'.repeat(1001) }).expect(400);
    });

    it('rejects unknown fields', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 5, verified: true }).expect(400);
    });
  });

  describe('rolling averages', () => {
    it('moves the shop rating when a review lands', async () => {
      const before = await vendorRow();
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 5 }).expect(201);

      const after = await vendorRow();
      expect(after.ratingCount).toBe(before.ratingCount + 1);
    });

    it('averages several reviews correctly', async () => {
      // Start from a clean slate for this shop so the maths is checkable.
      await prisma.review.deleteMany({ where: { vendorId: product.vendorId } });
      await prisma.vendor.update({
        where: { id: product.vendorId },
        data: { ratingAvg: 0, ratingCount: 0 },
      });

      for (const rating of [5, 4, 3]) {
        const slice = await buy();
        await review({ vendorOrderId: slice.id, rating }).expect(201);
      }

      const after = await vendorRow();
      expect(after.ratingCount).toBe(3);
      expect(after.ratingAvg).toBeCloseTo(4, 5);
    });

    it('rates the listing too when the review names a plant', async () => {
      const slice = await buy();
      await review({ vendorOrderId: slice.id, productId: product.id, rating: 5 }).expect(201);

      const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.ratingCount).toBeGreaterThan(0);
      expect(row.ratingAvg).toBeGreaterThan(0);
    });

    it('rejects a plant that was not in that order', async () => {
      const slice = await buy();
      const otherProduct = await prisma.product.findFirstOrThrow({
        where: { id: { not: product.id } },
        select: { id: true },
      });

      await review({ vendorOrderId: slice.id, productId: otherProduct.id, rating: 5 }).expect(400);
    });

    it('re-derives the average after an edit', async () => {
      await prisma.review.deleteMany({ where: { vendorId: product.vendorId } });
      const slice = await buy();
      const { body } = await review({ vendorOrderId: slice.id, rating: 5 }).expect(201);

      await http()
        .patch(`/api/reviews/${body.id}`)
        .set(auth(buyerToken))
        .send({ rating: 2 })
        .expect(200);

      const after = await vendorRow();
      expect(after.ratingAvg).toBeCloseTo(2, 5);
      expect(after.ratingCount).toBe(1);
    });

    it('drops back to zero when the only review is deleted', async () => {
      await prisma.review.deleteMany({ where: { vendorId: product.vendorId } });
      const slice = await buy();
      const { body } = await review({ vendorOrderId: slice.id, rating: 4 }).expect(201);

      await http().delete(`/api/reviews/${body.id}`).set(auth(buyerToken)).expect(200);

      const after = await vendorRow();
      expect(after.ratingCount).toBe(0);
      expect(after.ratingAvg).toBe(0);
    });
  });

  describe('ownership', () => {
    it('will not let a stranger edit or delete a review', async () => {
      const slice = await buy();
      const { body } = await review({ vendorOrderId: slice.id, rating: 5 }).expect(201);

      await http()
        .patch(`/api/reviews/${body.id}`)
        .set(auth(strangerToken))
        .send({ rating: 1 })
        .expect(403);
      await http().delete(`/api/reviews/${body.id}`).set(auth(strangerToken)).expect(403);
    });
  });

  describe('reading reviews', () => {
    it('is public, with a zero-filled star breakdown', async () => {
      await prisma.review.deleteMany({ where: { vendorId: product.vendorId } });
      const slice = await buy();
      await review({ vendorOrderId: slice.id, rating: 5, comment: 'Lovely' }).expect(201);

      const { body } = await http().get(`/api/reviews/shop/${vendorSlug}`).expect(200);

      expect(body.items[0]).toMatchObject({ rating: 5, comment: 'Lovely' });
      expect(body.breakdown).toHaveLength(5);
      expect(body.breakdown[0]).toEqual({ rating: 5, count: 1 });
      expect(body.vendor.ratingAvg).toBe(5);
    });

    it('404s for a shop that does not exist', async () => {
      await http().get('/api/reviews/shop/no-such-nursery').expect(404);
    });

    it('paginates', async () => {
      const { body } = await http().get(`/api/reviews/shop/${vendorSlug}?pageSize=1`).expect(200);
      expect(body.items.length).toBeLessThanOrEqual(1);
      expect(body.pageSize).toBe(1);
    });

    it('tells the customer which orders are still waiting for a review', async () => {
      const slice = await buy();

      const { body } = await http().get('/api/reviews/mine').set(auth(buyerToken)).expect(200);

      expect(body.awaiting.map((item: { id: string }) => item.id)).toContain(slice.id);

      await review({ vendorOrderId: slice.id, rating: 5 }).expect(201);
      const { body: after } = await http()
        .get('/api/reviews/mine')
        .set(auth(buyerToken))
        .expect(200);

      expect(after.awaiting.map((item: { id: string }) => item.id)).not.toContain(slice.id);
      expect(after.written.map((item: { vendorOrderId: string }) => item.vendorOrderId)).toContain(
        slice.id,
      );
    });

    it('surfaces the shop rating on its public page', async () => {
      const { body } = await http().get(`/api/shops/${vendorSlug}`).expect(200);
      expect(body.ratingAvg).toEqual(expect.any(Number));
      expect(body.ratingCount).toEqual(expect.any(Number));
    });
  });
});
