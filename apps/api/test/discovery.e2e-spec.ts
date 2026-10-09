import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Real PostGIS, real seed data. Coordinates are actual Bengaluru locations, so a
 * wrong projection or a lat/lng swap shows up immediately as an absurd distance.
 *
 * Seeded shops: Lalbagh (12.9507, 77.5848, 8 km radius) · Indiranagar (12.9784,
 * 77.6408, 6 km) · Whitefield (12.9698, 77.7500, 10 km) · Jayanagar · Hebbal
 * (not approved).
 */
const MG_ROAD = { lat: 12.9758, lng: 77.6045 };
const WHITEFIELD = { lat: 12.9698, lng: 77.75 };
const MUMBAI = { lat: 19.076, lng: 72.8777 };

interface NearbyVendor {
  name: string;
  slug: string;
  distanceKm: number;
  deliversToYou: boolean;
  deliveryRadiusKm: number;
  productCount: number;
  startingPrice: string | null;
}

describe('Nearby discovery (e2e)', () => {
  let app: INestApplication;
  let http: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = '/api';
  });

  afterAll(async () => {
    await app.close();
  });

  const nearby = (params: Record<string, string | number | boolean>) =>
    request(app.getHttpServer())
      .get(`${http}/nearby/vendors`)
      .query(params as Record<string, string>);

  describe('radius filtering', () => {
    it('returns only shops inside the radius, nearest first', async () => {
      const { body } = await nearby({ ...MG_ROAD, radiusKm: 5 }).expect(200);
      const items = body.items as NearbyVendor[];

      expect(items.length).toBeGreaterThan(0);
      expect(items.every((v) => v.distanceKm <= 5)).toBe(true);

      const distances = items.map((v) => v.distanceKm);
      expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    });

    it('a wider radius is a strict superset of a narrower one', async () => {
      const small = await nearby({ ...MG_ROAD, radiusKm: 5 }).expect(200);
      const large = await nearby({ ...MG_ROAD, radiusKm: 25 }).expect(200);

      const smallSlugs = (small.body.items as NearbyVendor[]).map((v) => v.slug);
      const largeSlugs = (large.body.items as NearbyVendor[]).map((v) => v.slug);

      expect(large.body.total).toBeGreaterThan(small.body.total);
      expect(largeSlugs).toEqual(expect.arrayContaining(smallSlugs));
    });

    it('returns an empty page — not an error — when nothing is in range', async () => {
      const { body } = await nearby({ ...MUMBAI, radiusKm: 5 }).expect(200);
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('measures real-world distance correctly (MG Road → Lalbagh ≈ 3.5 km)', async () => {
      const { body } = await nearby({ ...MG_ROAD, radiusKm: 25 }).expect(200);
      const lalbagh = (body.items as NearbyVendor[]).find(
        (v) => v.slug === 'lalbagh-green-nursery',
      );

      expect(lalbagh).toBeDefined();
      expect(lalbagh!.distanceKm).toBeGreaterThan(3);
      expect(lalbagh!.distanceKm).toBeLessThan(4);
    });

    it('standing on a shop’s doorstep reports ~0 km', async () => {
      const { body } = await nearby({ ...WHITEFIELD, radiusKm: 2 }).expect(200);
      const studio = (body.items as NearbyVendor[]).find(
        (v) => v.slug === 'whitefield-plant-studio',
      );

      expect(studio!.distanceKm).toBeLessThanOrEqual(0.1);
      expect(studio!.deliversToYou).toBe(true);
    });
  });

  describe('delivery reachability', () => {
    it('deliversToYou reflects each vendor’s own radius', async () => {
      const { body } = await nearby({ ...MG_ROAD, radiusKm: 25 }).expect(200);

      for (const vendor of body.items as NearbyVendor[]) {
        expect(vendor.deliversToYou).toBe(vendor.distanceKm <= vendor.deliveryRadiusKm);
      }
    });

    it('deliverableOnly drops shops that cannot reach the customer', async () => {
      const all = await nearby({ ...MG_ROAD, radiusKm: 25 }).expect(200);
      const reachable = await nearby({
        ...MG_ROAD,
        radiusKm: 25,
        deliverableOnly: true,
      }).expect(200);

      expect((all.body.items as NearbyVendor[]).some((v) => !v.deliversToYou)).toBe(true);
      expect((reachable.body.items as NearbyVendor[]).every((v) => v.deliversToYou)).toBe(true);
      expect(reachable.body.total).toBeLessThan(all.body.total);
    });
  });

  describe('visibility rules', () => {
    it('hides unapproved vendors from the public feed', async () => {
      const { body } = await nearby({ lat: 13.0358, lng: 77.597, radiusKm: 50 }).expect(200);
      const slugs = (body.items as NearbyVendor[]).map((v) => v.slug);

      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).not.toContain('hebbal-terrace-garden-co');
    });

    it('needs no authentication', async () => {
      await request(app.getHttpServer())
        .get(`${http}/nearby/vendors`)
        .query({ ...MG_ROAD })
        .expect(200);
    });
  });

  describe('filters, sorting and paging', () => {
    it('filters by category slug', async () => {
      const { body } = await nearby({ ...MG_ROAD, radiusKm: 25, category: 'flower-shop' }).expect(
        200,
      );

      expect(body.total).toBeGreaterThan(0);
      expect(body.total).toBeLessThan(5);
    });

    it('sorts by rating when asked', async () => {
      const { body } = await nearby({ ...MG_ROAD, radiusKm: 25, sort: 'rating' }).expect(200);
      const ratings = (body.items as { ratingAvg: number }[]).map((v) => v.ratingAvg);

      expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
    });

    it('pages without repeating a shop', async () => {
      const first = await nearby({ ...MG_ROAD, radiusKm: 25, pageSize: 2, page: 1 }).expect(200);
      const second = await nearby({ ...MG_ROAD, radiusKm: 25, pageSize: 2, page: 2 }).expect(200);

      const a = (first.body.items as NearbyVendor[]).map((v) => v.slug);
      const b = (second.body.items as NearbyVendor[]).map((v) => v.slug);

      expect(a).toHaveLength(2);
      expect(a.filter((slug) => b.includes(slug))).toEqual([]);
    });

    it('includes a product preview and a starting price for each card', async () => {
      const { body } = await nearby({ ...MG_ROAD, radiusKm: 25 }).expect(200);
      const vendor = body.items[0];

      expect(vendor.productCount).toBeGreaterThan(0);
      expect(Number(vendor.startingPrice)).toBeGreaterThan(0);
      expect(vendor.preview.length).toBeGreaterThan(0);
      expect(vendor.preview.length).toBeLessThanOrEqual(3);
    });
  });

  describe('input validation', () => {
    it.each([
      ['missing coordinates', {}],
      ['latitude out of range', { lat: 91, lng: 77.6 }],
      ['longitude out of range', { lat: 12.97, lng: 181 }],
      ['non-numeric latitude', { lat: 'here', lng: 77.6 }],
      ['radius above the cap', { ...MG_ROAD, radiusKm: 5000 }],
      ['negative radius', { ...MG_ROAD, radiusKm: -1 }],
      ['unknown sort', { ...MG_ROAD, sort: 'cheapest' }],
    ])('rejects %s with 400', async (_label, params) => {
      await nearby(params as Record<string, string>).expect(400);
    });
  });

  describe('nearby products', () => {
    const products = (params: Record<string, string | number | boolean>) =>
      request(app.getHttpServer())
        .get(`${http}/nearby/products`)
        .query(params as Record<string, string>);

    it('lists in-stock listings from nearby shops with their distance', async () => {
      const { body } = await products({ ...MG_ROAD, radiusKm: 25 }).expect(200);

      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.stock).toBeGreaterThan(0);
        expect(item.distanceKm).toBeLessThanOrEqual(25);
        expect(item.vendor.name).toBeTruthy();
      }
    });

    it('matches on plant name as well as listing title', async () => {
      const { body } = await products({ ...MG_ROAD, radiusKm: 25, q: 'ocimum' }).expect(200);

      expect(body.total).toBeGreaterThan(0);
      expect(
        (body.items as { plant: { scientificName: string } }[]).every((p) =>
          p.plant.scientificName.toLowerCase().includes('ocimum'),
        ),
      ).toBe(true);
    });

    it('sorts by price when asked', async () => {
      const { body } = await products({ ...MG_ROAD, radiusKm: 25, sort: 'price_asc' }).expect(200);
      const prices = (body.items as { price: string }[]).map((p) => Number(p.price));

      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    it('respects a price ceiling', async () => {
      const { body } = await products({ ...MG_ROAD, radiusKm: 25, maxPrice: 200 }).expect(200);

      expect(body.total).toBeGreaterThan(0);
      expect((body.items as { price: string }[]).every((p) => Number(p.price) <= 200)).toBe(true);
    });

    it('returns money as a string so no precision is lost', async () => {
      const { body } = await products({ ...MG_ROAD, radiusKm: 25 }).expect(200);
      expect(typeof body.items[0].price).toBe('string');
    });
  });

  describe('public shop page', () => {
    it('returns the shop with its catalogue and distance from the caller', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`${http}/shops/lalbagh-green-nursery`)
        .query(MG_ROAD)
        .expect(200);

      expect(body.name).toBe('Lalbagh Green Nursery');
      expect(body.products.length).toBeGreaterThan(0);
      expect(body.distanceKm).toBeGreaterThan(0);
      expect(body.deliversToYou).toBe(true);
    });

    it('works without coordinates, reporting distance as null', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`${http}/shops/lalbagh-green-nursery`)
        .expect(200);

      expect(body.distanceKm).toBeNull();
      expect(body.products.length).toBeGreaterThan(0);
    });

    it('404s for an unknown slug and for an unapproved shop', async () => {
      await request(app.getHttpServer()).get(`${http}/shops/does-not-exist`).expect(404);
      await request(app.getHttpServer()).get(`${http}/shops/hebbal-terrace-garden-co`).expect(404);
    });
  });
});
