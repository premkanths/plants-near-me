import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  NearbyProductsQueryDto,
  NearbyVendorsQueryDto,
  OptionalPointQueryDto,
} from './dto/discovery.dto';

/**
 * Raw rows as PostGIS returns them (snake_case, numeric -> string).
 * They are mapped to the API shape before leaving the service.
 */
interface VendorRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address_line: string | null;
  city: string;
  pincode: string | null;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  delivery_fee: string;
  min_order_value: string;
  rating_avg: number;
  rating_count: number;
  distance_m: number;
  delivers: boolean;
  product_count: bigint;
  min_price: string | null;
}

interface ProductRow {
  id: string;
  title: string;
  price: string;
  stock: number;
  pot_size: string | null;
  images: string[];
  plant_id: string;
  common_name: string;
  scientific_name: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  delivers: boolean;
  delivery_fee: string;
}

export interface NearbyVendor {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  addressLine: string | null;
  city: string;
  pincode: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  deliversToYou: boolean;
  deliveryRadiusKm: number;
  deliveryFee: string;
  minOrderValue: string;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
  startingPrice: string | null;
  categories: string[];
  preview: { id: string; title: string; price: string; image: string | null }[];
}

const KM = 1000;
/** Metres -> km with one decimal; 640 m becomes 0.6 km, not 0.64. */
const toKm = (metres: number): number => Math.round((metres / KM) * 10) / 10;

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vendors whose shop sits inside the search radius.
   *
   * ST_DWithin is the filter (it can use the GiST index on vendors.location);
   * ST_Distance is only computed for the rows that survived it. Doing it the
   * other way round — ST_Distance(...) < r in the WHERE clause — would force a
   * full scan, so the two functions are deliberately not interchangeable here.
   */
  async nearbyVendors(query: NearbyVendorsQueryDto): Promise<{
    items: NearbyVendor[];
    total: number;
    page: number;
    pageSize: number;
    radiusKm: number;
    origin: { lat: number; lng: number };
  }> {
    const { lat, lng, radiusKm, page, pageSize } = query;
    const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;
    const where = this.vendorWhere(query, origin);

    const orderBy =
      query.sort === 'rating'
        ? Prisma.sql`v.rating_avg DESC, v.rating_count DESC, distance_m ASC`
        : query.sort === 'name'
          ? Prisma.sql`v.name ASC`
          : Prisma.sql`distance_m ASC`;

    const rows = await this.prisma.$queryRaw<VendorRow[]>`
      SELECT
        v.id, v.name, v.slug, v.description, v.address_line, v.city, v.pincode,
        v.latitude, v.longitude, v.delivery_radius_km, v.delivery_fee, v.min_order_value,
        v.rating_avg, v.rating_count,
        ST_Distance(v.location, ${origin}) AS distance_m,
        ST_DWithin(v.location, ${origin}, v.delivery_radius_km * 1000) AS delivers,
        (SELECT COUNT(*) FROM products p
          WHERE p.vendor_id = v.id AND p.active = true AND p.stock > 0) AS product_count,
        (SELECT MIN(p.price) FROM products p
          WHERE p.vendor_id = v.id AND p.active = true AND p.stock > 0) AS min_price
      FROM vendors v
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM vendors v WHERE ${where}
    `;

    const items = await this.decorateVendors(rows);
    return {
      items,
      total: Number(count),
      page,
      pageSize,
      radiusKm,
      origin: { lat, lng },
    };
  }

  /** In-stock listings from nearby shops — the "what can I actually buy today" view. */
  async nearbyProducts(query: NearbyProductsQueryDto) {
    const { lat, lng, radiusKm, page, pageSize } = query;
    const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;

    const filters: Prisma.Sql[] = [
      Prisma.sql`p.active = true`,
      Prisma.sql`p.stock > 0`,
      this.vendorWhere(query, origin),
      Prisma.sql`ST_DWithin(v.location, ${origin}, ${radiusKm * KM}::float8)`,
    ];

    if (query.q) {
      const like = `%${query.q}%`;
      filters.push(
        Prisma.sql`(p.title ILIKE ${like} OR pl.common_name ILIKE ${like} OR pl.scientific_name ILIKE ${like})`,
      );
    }
    if (query.maxPrice !== undefined) {
      filters.push(Prisma.sql`p.price <= ${query.maxPrice}::numeric`);
    }

    const where = Prisma.join(filters, ' AND ');
    const orderBy =
      query.sort === 'price_asc'
        ? Prisma.sql`p.price ASC, distance_m ASC`
        : query.sort === 'price_desc'
          ? Prisma.sql`p.price DESC, distance_m ASC`
          : query.sort === 'rating'
            ? Prisma.sql`v.rating_avg DESC, distance_m ASC`
            : Prisma.sql`distance_m ASC, p.price ASC`;

    const rows = await this.prisma.$queryRaw<ProductRow[]>`
      SELECT
        p.id, p.title, p.price, p.stock, p.pot_size, p.images, p.plant_id,
        pl.common_name, pl.scientific_name,
        v.id AS vendor_id, v.name AS vendor_name, v.slug AS vendor_slug,
        v.latitude, v.longitude, v.delivery_fee,
        ST_Distance(v.location, ${origin}) AS distance_m,
        ST_DWithin(v.location, ${origin}, v.delivery_radius_km * 1000) AS delivers
      FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      JOIN plants pl ON pl.id = p.plant_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      JOIN plants pl ON pl.id = p.plant_id
      WHERE ${where}
    `;

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        price: row.price,
        stock: row.stock,
        potSize: row.pot_size,
        image: row.images?.[0] ?? null,
        plant: {
          id: row.plant_id,
          commonName: row.common_name,
          scientificName: row.scientific_name,
        },
        vendor: {
          id: row.vendor_id,
          name: row.vendor_name,
          slug: row.vendor_slug,
          latitude: row.latitude,
          longitude: row.longitude,
          deliveryFee: row.delivery_fee,
        },
        distanceKm: toKm(row.distance_m),
        deliversToYou: row.delivers,
      })),
      total: Number(count),
      page,
      pageSize,
      radiusKm,
      origin: { lat, lng },
    };
  }

  /** Public shop page. Distance is included only when the caller sent coordinates. */
  async vendorBySlug(slug: string, point: OptionalPointQueryDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { slug, approved: true, suspended: false },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        addressLine: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        latitude: true,
        longitude: true,
        deliveryRadiusKm: true,
        deliveryFee: true,
        minOrderValue: true,
        ratingAvg: true,
        ratingCount: true,
        categories: { select: { category: { select: { name: true, slug: true } } } },
        products: {
          where: { active: true },
          orderBy: [{ stock: 'desc' }, { price: 'asc' }],
          select: {
            id: true,
            title: true,
            price: true,
            stock: true,
            potSize: true,
            images: true,
            plant: { select: { id: true, commonName: true, scientificName: true, slug: true } },
          },
        },
      },
    });

    if (!vendor) throw new NotFoundException('Nursery not found');

    let distanceKm: number | null = null;
    let deliversToYou: boolean | null = null;

    if (point.lat !== undefined && point.lng !== undefined) {
      const [row] = await this.prisma.$queryRaw<[{ distance_m: number; delivers: boolean }]>`
        SELECT
          ST_Distance(v.location, ST_SetSRID(ST_MakePoint(${point.lng}::float8, ${point.lat}::float8), 4326)::geography) AS distance_m,
          ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(${point.lng}::float8, ${point.lat}::float8), 4326)::geography, v.delivery_radius_km * 1000) AS delivers
        FROM vendors v WHERE v.id = ${vendor.id}::uuid
      `;
      distanceKm = toKm(row.distance_m);
      deliversToYou = row.delivers;
    }

    const { categories, products, deliveryFee, minOrderValue, ...rest } = vendor;
    return {
      ...rest,
      deliveryFee: deliveryFee.toString(),
      minOrderValue: minOrderValue.toString(),
      categories: categories.map((c) => c.category.name),
      distanceKm,
      deliversToYou,
      products: products.map((p) => ({ ...p, price: p.price.toString() })),
    };
  }

  /** Shared visibility + spatial predicate so vendor and product queries can never drift apart. */
  private vendorWhere(
    query: NearbyVendorsQueryDto | NearbyProductsQueryDto,
    origin: Prisma.Sql,
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [
      Prisma.sql`v.approved = true`,
      Prisma.sql`v.suspended = false`,
      Prisma.sql`v.location IS NOT NULL`,
      Prisma.sql`ST_DWithin(v.location, ${origin}, ${query.radiusKm * KM}::float8)`,
    ];

    if (query.deliverableOnly) {
      filters.push(Prisma.sql`ST_DWithin(v.location, ${origin}, v.delivery_radius_km * 1000)`);
    }
    if (query.category) {
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM vendor_categories vc
        JOIN categories c ON c.id = vc.category_id
        WHERE vc.vendor_id = v.id AND c.slug = ${query.category}
      )`);
    }
    if ('q' in query && query.q && !('maxPrice' in query)) {
      filters.push(Prisma.sql`v.name ILIKE ${`%${query.q}%`}`);
    }

    return Prisma.join(filters, ' AND ');
  }

  /** Adds categories and a three-product preview without an N+1 per card. */
  private async decorateVendors(rows: VendorRow[]): Promise<NearbyVendor[]> {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    const [categories, products] = await Promise.all([
      this.prisma.vendorCategory.findMany({
        where: { vendorId: { in: ids } },
        select: { vendorId: true, category: { select: { name: true } } },
      }),
      this.prisma.product.findMany({
        where: { vendorId: { in: ids }, active: true, stock: { gt: 0 } },
        orderBy: [{ price: 'asc' }],
        select: { id: true, vendorId: true, title: true, price: true, images: true },
      }),
    ]);

    const categoriesBy = new Map<string, string[]>();
    for (const row of categories) {
      categoriesBy.set(row.vendorId, [
        ...(categoriesBy.get(row.vendorId) ?? []),
        row.category.name,
      ]);
    }

    const previewBy = new Map<string, NearbyVendor['preview']>();
    for (const product of products) {
      const current = previewBy.get(product.vendorId) ?? [];
      if (current.length >= 3) continue;
      current.push({
        id: product.id,
        title: product.title,
        price: product.price.toString(),
        image: product.images?.[0] ?? null,
      });
      previewBy.set(product.vendorId, current);
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      addressLine: row.address_line,
      city: row.city,
      pincode: row.pincode,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceKm: toKm(row.distance_m),
      deliversToYou: row.delivers,
      deliveryRadiusKm: row.delivery_radius_km,
      deliveryFee: row.delivery_fee,
      minOrderValue: row.min_order_value,
      ratingAvg: row.rating_avg,
      ratingCount: row.rating_count,
      productCount: Number(row.product_count),
      startingPrice: row.min_price,
      categories: categoriesBy.get(row.id) ?? [],
      preview: previewBy.get(row.id) ?? [],
    }));
  }
}
