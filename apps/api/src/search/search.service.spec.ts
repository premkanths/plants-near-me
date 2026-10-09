import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchProductsDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * Pins the SQL contract of search: which tsquery parser is used, how the two
 * tiers are chosen, and that every user-supplied value is bound as a parameter.
 */
describe('SearchService', () => {
  let service: SearchService;
  let prisma: { $queryRaw: jest.Mock };

  interface Fragment {
    strings: readonly string[];
    values: unknown[];
  }
  const isFragment = (value: unknown): value is Fragment =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Fragment).strings) &&
    Array.isArray((value as Fragment).values);

  const render = (
    strings: readonly string[],
    values: unknown[],
  ): { text: string; params: unknown[] } => {
    let text = strings[0] ?? '';
    const params: unknown[] = [];

    values.forEach((value, index) => {
      if (isFragment(value)) {
        const nested = render(value.strings, value.values);
        text += nested.text;
        params.push(...nested.params);
      } else {
        text += '?';
        params.push(value);
      }
      text += strings[index + 1] ?? '';
    });

    return { text, params };
  };

  const renderCall = (call: unknown[]) => render(call[0] as string[], call.slice(1));
  const allSql = () => prisma.$queryRaw.mock.calls.map((call) => renderCall(call).text).join('\n');
  const allParams = () => prisma.$queryRaw.mock.calls.flatMap((call) => renderCall(call).params);

  /** Rows, count, facets — in the order the service issues them. */
  const respond = (rowCount: number) => {
    prisma.$queryRaw
      .mockResolvedValueOnce(Array.from({ length: rowCount }, (_, i) => row(i)))
      .mockResolvedValueOnce([{ count: BigInt(rowCount) }])
      .mockResolvedValueOnce([{ indoor: BigInt(1), min_price: '100', max_price: '900' }]);
  };

  const row = (index: number) => ({
    id: `p${index}`,
    title: 'Money Plant',
    description: null,
    price: '240.00',
    stock: 4,
    pot_size: '8 inch',
    images: [],
    plant_id: 'pl1',
    common_name: 'Money Plant',
    scientific_name: 'Epipremnum aureum',
    plant_slug: 'money-plant',
    sunlight: 'PARTIAL_SUN',
    water: 'MEDIUM',
    difficulty: 'EASY',
    placement: 'INDOOR',
    pet_friendly: false,
    air_purifying: true,
    flowering_plant: false,
    image_url: null,
    vendor_id: 'v1',
    vendor_name: 'Lalbagh',
    vendor_slug: 'lalbagh',
    rating_avg: 4.4,
    rating_count: 9,
    distance_m: 3456,
    delivers: true,
    score: 1.88,
  });

  const dto = (overrides: Partial<SearchProductsDto> = {}): SearchProductsDto =>
    ({
      sort: 'relevance',
      page: 1,
      pageSize: 20,
      inStockOnly: true,
      ...overrides,
    }) as SearchProductsDto;

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SearchService);
  });

  describe('tier 1 — full-text', () => {
    it('parses the phrase with websearch_to_tsquery, not plainto_tsquery', async () => {
      respond(2);
      await service.searchProducts(dto({ q: 'money plant' }));

      expect(allSql()).toContain('websearch_to_tsquery');
      expect(allSql()).not.toContain('plainto_tsquery');
    });

    it('matches either the listing vector or the species vector', async () => {
      respond(2);
      await service.searchProducts(dto({ q: 'tulsi' }));

      expect(allSql()).toMatch(/p\.search_vector @@ .*OR pl\.search_vector @@/s);
    });

    it('ranks the listing title above the species description', async () => {
      respond(2);
      await service.searchProducts(dto({ q: 'tulsi' }));
      const sql = allSql();

      expect(sql).toContain('ts_rank_cd(p.search_vector');
      expect(sql).toContain('* 1.0');
      expect(sql).toContain('* 0.6');
    });

    it('reports the strategy it used', async () => {
      respond(2);
      const result = await service.searchProducts(dto({ q: 'tulsi' }));
      expect(result.strategy).toBe('exact');
    });

    it('does not run the fuzzy tier when the index found something', async () => {
      respond(2);
      await service.searchProducts(dto({ q: 'tulsi' }));
      expect(allSql()).not.toContain('similarity(');
    });
  });

  describe('tier 2 — trigram fallback', () => {
    beforeEach(() => {
      respond(0); // exact tier finds nothing
      respond(1); // fuzzy tier finds something
      prisma.$queryRaw.mockResolvedValueOnce([{ label: 'Money Plant', sim: 0.375 }]);
    });

    it('falls back to pg_trgm similarity on a miss', async () => {
      const result = await service.searchProducts(dto({ q: 'mony plnt' }));

      expect(result.strategy).toBe('fuzzy');
      expect(allSql()).toContain('similarity(');
    });

    it('suggests the closest catalogue term', async () => {
      const result = await service.searchProducts(dto({ q: 'mony plnt' }));
      expect(result.didYouMean).toBe('Money Plant');
    });

    it('requires a minimum similarity so nonsense does not match everything', async () => {
      await service.searchProducts(dto({ q: 'mony plnt' }));
      expect(allParams()).toContain(0.22);
    });
  });

  describe('browse mode', () => {
    it('applies no text predicate when there is no query', async () => {
      respond(5);
      const result = await service.searchProducts(dto());

      expect(result.strategy).toBe('browse');
      expect(allSql()).not.toContain('websearch_to_tsquery');
      expect(allSql()).not.toContain('similarity(');
    });

    it('orders by something stable instead of relevance', async () => {
      respond(5);
      await service.searchProducts(dto());
      expect(renderCall(prisma.$queryRaw.mock.calls[0]).text).toContain('v.rating_avg DESC');
    });
  });

  describe('filters', () => {
    it('hides inactive listings and unapproved shops', async () => {
      respond(1);
      await service.searchProducts(dto());
      const sql = allSql();

      expect(sql).toContain('p.active = true');
      expect(sql).toContain('v.approved = true');
      expect(sql).toContain('v.suspended = false');
    });

    it('requires stock by default and can be asked not to', async () => {
      respond(1);
      await service.searchProducts(dto());
      expect(allSql()).toContain('p.stock > 0');

      prisma.$queryRaw.mockClear();
      respond(1);
      await service.searchProducts(dto({ inStockOnly: false }));
      expect(allSql()).not.toContain('p.stock > 0');
    });

    it('binds multi-value trait filters as parameters', async () => {
      respond(1);
      await service.searchProducts(dto({ placement: ['INDOOR', 'BOTH'] }));

      expect(allSql()).toContain('pl.placement::text IN');
      expect(allParams()).toEqual(expect.arrayContaining(['INDOOR', 'BOTH']));
    });

    it('reports distance from coordinates alone but only *filters* with a radius', async () => {
      respond(1);
      await service.searchProducts(dto({ lat: 12.97, lng: 77.6 }));

      const { text } = renderCall(prisma.$queryRaw.mock.calls[0]);
      // Distance and deliverability are still computed for display …
      expect(text).toContain('ST_Distance(v.location');
      // … but nothing narrows the result set spatially.
      expect(text.slice(text.indexOf('WHERE'))).not.toContain('ST_DWithin');

      prisma.$queryRaw.mockClear();
      respond(1);
      await service.searchProducts(dto({ lat: 12.97, lng: 77.6, radiusKm: 5 }));

      const scoped = renderCall(prisma.$queryRaw.mock.calls[0]).text;
      expect(scoped.slice(scoped.indexOf('WHERE'))).toContain('ST_DWithin');
      expect(allParams()).toContain(5000);
    });

    it('boosts nearby results without overwhelming text relevance', async () => {
      respond(1);
      await service.searchProducts(dto({ q: 'tulsi', lat: 12.97, lng: 77.6, radiusKm: 5 }));
      expect(allSql()).toContain('* 0.3');
    });
  });

  describe('safety', () => {
    it('never interpolates the search term into SQL text', async () => {
      respond(1);
      await service.searchProducts(dto({ q: "'; DROP TABLE products; --" }));

      expect(allSql()).not.toContain('DROP TABLE');
      expect(allParams()).toContain("'; DROP TABLE products; --");
    });

    it('returns an empty suggestion set for an empty term without querying', async () => {
      const result = await service.suggest({ q: '' });

      expect(result).toEqual({ plants: [], shops: [] });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
