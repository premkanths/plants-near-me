import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from './discovery.service';
import type { NearbyVendorsQueryDto } from './dto/discovery.dto';

/**
 * These tests pin the *SQL contract*: the spatial predicate, the visibility
 * filters and the ordering. They are the guard rail against someone "tidying"
 * the raw query later and quietly breaking radius filtering or leaking
 * unapproved vendors into the public feed.
 */
describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let prisma: {
    $queryRaw: jest.Mock;
    vendor: { findFirst: jest.Mock };
    vendorCategory: { findMany: jest.Mock };
    product: { findMany: jest.Mock };
  };

  /**
   * $queryRaw is called as a tagged template, so the mock receives
   * (strings, ...values) with nested Prisma.sql fragments among the values.
   * These helpers flatten that back into readable SQL + a flat parameter list.
   */
  interface SqlFragment {
    strings: readonly string[];
    values: unknown[];
  }
  const isFragment = (value: unknown): value is SqlFragment =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as SqlFragment).strings) &&
    Array.isArray((value as SqlFragment).values);

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
  const sqlOf = (call: unknown[]): string => renderCall(call).text;
  const paramsOf = (call: unknown[]): unknown[] => renderCall(call).params;
  const allSql = (): string => prisma.$queryRaw.mock.calls.map(sqlOf).join('\n');

  const vendorRow = {
    id: 'v1',
    name: 'Lalbagh Green Nursery',
    slug: 'lalbagh',
    description: null,
    address_line: 'Lalbagh Road',
    city: 'Bengaluru',
    pincode: '560004',
    latitude: 12.9507,
    longitude: 77.5848,
    delivery_radius_km: 8,
    delivery_fee: '49',
    min_order_value: '0',
    rating_avg: 4.5,
    rating_count: 12,
    distance_m: 3456.78,
    delivers: true,
    product_count: BigInt(10),
    min_price: '100',
  };

  const query = (overrides: Partial<NearbyVendorsQueryDto> = {}): NearbyVendorsQueryDto =>
    ({
      lat: 12.9758,
      lng: 77.6045,
      radiusKm: 5,
      page: 1,
      pageSize: 12,
      sort: 'distance',
      ...overrides,
    }) as NearbyVendorsQueryDto;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      vendor: { findFirst: jest.fn() },
      vendorCategory: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [DiscoveryService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(DiscoveryService);
  });

  describe('nearbyVendors', () => {
    beforeEach(() => {
      prisma.$queryRaw
        .mockResolvedValueOnce([vendorRow])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
    });

    it('filters with ST_DWithin so the GiST index can be used', async () => {
      await service.nearbyVendors(query());
      expect(allSql()).toContain('ST_DWithin');
    });

    it('computes the distance with ST_Distance rather than filtering on it', async () => {
      await service.nearbyVendors(query());
      const select = sqlOf(prisma.$queryRaw.mock.calls[0]);
      expect(select).toContain('ST_Distance');
      // ST_Distance may only appear in SELECT/ORDER BY, never as the radius filter.
      expect(select.slice(select.indexOf('WHERE'))).not.toMatch(/ST_Distance\([^)]*\)\s*<=?\s*\$/);
    });

    it('never exposes unapproved or suspended shops', async () => {
      await service.nearbyVendors(query());
      const sql = allSql();
      expect(sql).toContain('v.approved = true');
      expect(sql).toContain('v.suspended = false');
    });

    it('passes the radius to PostGIS in metres', async () => {
      await service.nearbyVendors(query({ radiusKm: 7.5 }));
      expect(paramsOf(prisma.$queryRaw.mock.calls[0])).toContain(7500);
    });

    it('converts metres to one-decimal kilometres', async () => {
      const result = await service.nearbyVendors(query());
      expect(result.items[0].distanceKm).toBe(3.5);
    });

    it('marks a shop deliverable from the vendor’s own radius, not the search radius', async () => {
      const result = await service.nearbyVendors(query());
      expect(result.items[0].deliversToYou).toBe(true);
      expect(allSql()).toContain('v.delivery_radius_km * 1000');
    });

    it('adds the delivery-radius predicate only when deliverableOnly is set', async () => {
      await service.nearbyVendors(query());
      const without = allSql().match(/delivery_radius_km \* 1000/g)?.length ?? 0;

      prisma.$queryRaw.mockClear();
      prisma.$queryRaw
        .mockResolvedValueOnce([vendorRow])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
      await service.nearbyVendors(query({ deliverableOnly: true }));
      const withFilter = allSql().match(/delivery_radius_km \* 1000/g)?.length ?? 0;

      expect(withFilter).toBeGreaterThan(without);
    });

    it('orders by distance by default and by rating when asked', async () => {
      await service.nearbyVendors(query());
      expect(sqlOf(prisma.$queryRaw.mock.calls[0])).toContain('distance_m ASC');

      prisma.$queryRaw.mockClear();
      prisma.$queryRaw
        .mockResolvedValueOnce([vendorRow])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
      await service.nearbyVendors(query({ sort: 'rating' }));
      expect(sqlOf(prisma.$queryRaw.mock.calls[0])).toContain('v.rating_avg DESC');
    });

    it('paginates with LIMIT/OFFSET derived from the page number', async () => {
      await service.nearbyVendors(query({ page: 3, pageSize: 10 }));
      const params = paramsOf(prisma.$queryRaw.mock.calls[0]);
      expect(params).toContain(10);
      expect(params).toContain(20);
    });

    it('returns serialisable money and counts (no Decimal or BigInt leaks)', async () => {
      const result = await service.nearbyVendors(query());
      expect(typeof result.items[0].deliveryFee).toBe('string');
      expect(typeof result.items[0].productCount).toBe('number');
      expect(typeof result.total).toBe('number');
    });

    it('skips the decoration queries when nothing is in range', async () => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: BigInt(0) }]);

      const result = await service.nearbyVendors(query());
      expect(result.items).toEqual([]);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('nearbyProducts', () => {
    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: BigInt(0) }]);
    });

    it('only offers listings that are active and in stock', async () => {
      await service.nearbyProducts({ ...query(), sort: 'distance' } as never);
      const sql = allSql();
      expect(sql).toContain('p.active = true');
      expect(sql).toContain('p.stock > 0');
    });

    it('applies the price ceiling as a numeric comparison', async () => {
      await service.nearbyProducts({ ...query(), sort: 'distance', maxPrice: 500 } as never);
      expect(allSql()).toContain('p.price <= ');
      expect(paramsOf(prisma.$queryRaw.mock.calls[0])).toContain(500);
    });

    it('parameterises the search term instead of interpolating it', async () => {
      await service.nearbyProducts({ ...query(), sort: 'distance', q: "'; DROP TABLE" } as never);
      const { text, params } = renderCall(prisma.$queryRaw.mock.calls[0]);
      expect(params).toContain("%'; DROP TABLE%");
      expect(text).not.toContain('DROP TABLE');
    });
  });

  describe('vendorBySlug', () => {
    it('404s for an unknown or unapproved shop', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);
      await expect(service.vendorBySlug('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ approved: true, suspended: false }),
        }),
      );
    });

    it('omits distance when the caller sends no coordinates', async () => {
      prisma.vendor.findFirst.mockResolvedValue({
        id: 'v1',
        name: 'Shop',
        slug: 'shop',
        deliveryFee: { toString: () => '49' },
        minOrderValue: { toString: () => '0' },
        categories: [],
        products: [],
      });

      const result = await service.vendorBySlug('shop', {});
      expect(result.distanceKm).toBeNull();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
