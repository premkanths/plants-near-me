import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Search against the real seeded catalogue: 20 species, 38 listings, English
 * text-search config. These tests are about behaviour a user would notice —
 * stemming, typos, phrase quoting, filters agreeing with facet counts.
 */
interface SearchItem {
  title: string;
  price: string;
  score: number;
  stock: number;
  distanceKm: number | null;
  plant: {
    commonName: string;
    scientificName: string;
    difficulty: string;
    placement: string;
    petFriendly: boolean;
  };
  vendor: { name: string; slug: string };
}

interface SearchBody {
  items: SearchItem[];
  total: number;
  strategy: 'exact' | 'fuzzy' | 'browse';
  didYouMean: string | null;
  facets: {
    placement: { indoor: number; outdoor: number };
    difficulty: { easy: number; moderate: number; hard: number };
    traits: { petFriendly: number; airPurifying: number; flowering: number; lowWater: number };
    price: { min: string | null; max: string | null };
  };
}

describe('Search (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const search = async (params: Record<string, string | number | boolean>): Promise<SearchBody> => {
    const { body } = await request(app.getHttpServer())
      .get('/api/search')
      .query(params as Record<string, string>)
      .expect(200);
    return body as SearchBody;
  };

  describe('full-text matching', () => {
    it('finds a plant by its common name', async () => {
      const body = await search({ q: 'money plant' });

      expect(body.strategy).toBe('exact');
      expect(body.total).toBeGreaterThan(0);
      expect(body.items.every((i) => i.plant.commonName === 'Money Plant')).toBe(true);
    });

    it('finds a plant by its scientific name', async () => {
      const body = await search({ q: 'ocimum' });

      expect(body.total).toBeGreaterThan(0);
      expect(body.items.every((i) => i.plant.scientificName.toLowerCase().includes('ocimum'))).toBe(
        true,
      );
    });

    it('matches words that only appear in the description', async () => {
      const body = await search({ q: 'neglect' });

      expect(body.strategy).toBe('exact');
      expect(body.items.map((i) => i.plant.commonName)).toContain('Snake Plant');
    });

    it('stems English word forms to the same results', async () => {
      const [singular, gerund] = await Promise.all([
        search({ q: 'grow' }),
        search({ q: 'growing' }),
      ]);

      expect(singular.total).toBeGreaterThan(0);
      expect(singular.total).toBe(gerund.total);
    });

    it('supports websearch -negation', async () => {
      // "leaves" appears in several species descriptions, Curry Leaf Plant among them.
      const all = await search({ q: 'leaves', pageSize: 50 });
      const without = await search({ q: 'leaves -curry', pageSize: 50 });

      expect(all.items.some((i) => i.plant.commonName === 'Curry Leaf Plant')).toBe(true);
      expect(without.items.some((i) => i.plant.commonName === 'Curry Leaf Plant')).toBe(false);
      expect(without.total).toBeLessThan(all.total);
    });

    it('treats a quoted phrase as an ordered phrase, not loose words', async () => {
      const loose = await search({ q: 'low light', pageSize: 50 });
      const phrase = await search({ q: '"low light"', pageSize: 50 });

      expect(loose.total).toBeGreaterThan(0);
      expect(phrase.total).toBeLessThanOrEqual(loose.total);
    });

    it('ranks a title match above a description-only match', async () => {
      const body = await search({ q: 'palm' });
      const scores = body.items.map((i) => i.score);

      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      expect(body.items[0].title.toLowerCase()).toContain('palm');
    });
  });

  describe('typo tolerance', () => {
    it('falls back to trigram matching and says what it meant', async () => {
      const body = await search({ q: 'mony plnt' });

      expect(body.strategy).toBe('fuzzy');
      expect(body.total).toBeGreaterThan(0);
      expect(body.items.every((i) => i.plant.commonName === 'Money Plant')).toBe(true);
      expect(body.didYouMean).toBe('Money Plant');
    });

    it('handles a missing letter in a scientific name', async () => {
      const body = await search({ q: 'hibicus' });

      expect(body.total).toBeGreaterThan(0);
      expect(body.items[0].plant.commonName).toBe('Hibiscus');
    });

    it('returns nothing — and suggests nothing — for genuine nonsense', async () => {
      const body = await search({ q: 'zzqxwv' });

      expect(body.total).toBe(0);
      expect(body.items).toEqual([]);
      expect(body.didYouMean).toBeNull();
    });
  });

  describe('filters', () => {
    it('combines trait filters', async () => {
      const body = await search({
        placement: 'INDOOR,BOTH',
        petFriendly: true,
        difficulty: 'EASY',
      });

      expect(body.total).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(['INDOOR', 'BOTH']).toContain(item.plant.placement);
        expect(item.plant.petFriendly).toBe(true);
        expect(item.plant.difficulty).toBe('EASY');
      }
    });

    it('applies a price band', async () => {
      const body = await search({ minPrice: 200, maxPrice: 400 });

      expect(body.total).toBeGreaterThan(0);
      expect(body.items.every((i) => Number(i.price) >= 200 && Number(i.price) <= 400)).toBe(true);
    });

    it('hides out-of-stock listings by default', async () => {
      const body = await search({});
      expect(body.items.every((i) => i.stock > 0)).toBe(true);
    });

    it('narrows to a delivery area when coordinates and a radius are given', async () => {
      const wide = await search({ lat: 12.9758, lng: 77.6045, radiusKm: 25 });
      const tight = await search({ lat: 12.9758, lng: 77.6045, radiusKm: 4 });

      expect(tight.total).toBeLessThan(wide.total);
      expect(tight.items.every((i) => (i.distanceKm ?? 99) <= 4)).toBe(true);
    });

    it('rejects an unknown trait value with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/search')
        .query({ difficulty: 'IMPOSSIBLE' })
        .expect(400);
    });

    it('rejects an oversized radius with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/search')
        .query({ lat: 12.97, lng: 77.6, radiusKm: 500 })
        .expect(400);
    });
  });

  describe('facets', () => {
    it('counts agree with the filtered result set', async () => {
      const body = await search({ difficulty: 'EASY' });
      const easyOnly = await search({ difficulty: 'EASY', petFriendly: true });

      expect(body.facets.difficulty.easy).toBe(body.total);
      expect(body.facets.difficulty.hard).toBe(0);
      expect(body.facets.traits.petFriendly).toBe(easyOnly.total);
    });

    it('reports the price range of the current results', async () => {
      const body = await search({ maxPrice: 300 });
      expect(Number(body.facets.price.max)).toBeLessThanOrEqual(300);
    });
  });

  describe('sorting and paging', () => {
    it('sorts by price ascending', async () => {
      const body = await search({ sort: 'price_asc', pageSize: 10 });
      const prices = body.items.map((i) => Number(i.price));

      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    it('sorts by distance when a location is supplied', async () => {
      const body = await search({ lat: 12.9758, lng: 77.6045, radiusKm: 25, sort: 'distance' });
      const distances = body.items.map((i) => i.distanceKm ?? 0);

      expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    });

    it('pages without repeating a listing', async () => {
      const first = await search({ sort: 'price_asc', pageSize: 5, page: 1 });
      const second = await search({ sort: 'price_asc', pageSize: 5, page: 2 });

      const overlap = first.items.filter((a) =>
        second.items.some((b) => a.title === b.title && a.vendor.slug === b.vendor.slug),
      );
      expect(overlap).toEqual([]);
    });
  });

  describe('relevance and location', () => {
    it('ranks a nearer shop above a farther one for the same plant', async () => {
      const body = await search({ q: 'tulsi', lat: 12.9758, lng: 77.6045, radiusKm: 25 });

      expect(body.items.length).toBeGreaterThan(1);
      expect(body.items[0].distanceKm!).toBeLessThan(body.items[1].distanceKm!);
      expect(body.items[0].score).toBeGreaterThan(body.items[1].score);
    });
  });

  describe('autocomplete', () => {
    it('suggests plants from a prefix', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/search/suggest')
        .query({ q: 'jas' })
        .expect(200);

      expect(body.plants.map((p: { label: string }) => p.label)).toContain('Jasmine');
    });

    it('suggests shops, even misspelled', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/search/suggest')
        .query({ q: 'urban jungl' })
        .expect(200);

      expect(body.shops[0].slug).toBe('indiranagar-urban-jungle');
    });

    it('requires a term', async () => {
      await request(app.getHttpServer()).get('/api/search/suggest').expect(400);
    });
  });

  describe('access', () => {
    it('is public', async () => {
      await request(app.getHttpServer()).get('/api/search').query({ q: 'tulsi' }).expect(200);
    });
  });
});
