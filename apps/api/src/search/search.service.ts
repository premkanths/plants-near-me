import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchProductsDto, SuggestDto } from './dto/search.dto';

interface ResultRow {
  id: string;
  title: string;
  description: string | null;
  price: string;
  stock: number;
  pot_size: string | null;
  images: string[];
  plant_id: string;
  common_name: string;
  scientific_name: string;
  plant_slug: string;
  sunlight: string;
  water: string;
  difficulty: string;
  placement: string;
  pet_friendly: boolean;
  air_purifying: boolean;
  flowering_plant: boolean;
  image_url: string | null;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  rating_avg: number;
  rating_count: number;
  distance_m: number | null;
  delivers: boolean | null;
  score: number;
}

export type SearchStrategy = 'exact' | 'fuzzy' | 'browse';

const KM = 1000;
/** Below this trigram similarity a "match" is noise rather than a typo. */
const FUZZY_THRESHOLD = 0.22;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search runs in two tiers.
   *
   *  1. `websearch_to_tsquery` against the stored tsvectors — fast, index-backed,
   *     understands "quoted phrases" and -negation.
   *  2. If that returns nothing and the visitor typed something, pg_trgm
   *     similarity takes over so "mony plnt" still finds Money Plant.
   *
   * The second tier only runs on a miss, so the common path stays one query.
   */
  async searchProducts(dto: SearchProductsDto) {
    const hasQuery = Boolean(dto.q && dto.q.length > 0);

    if (hasQuery) {
      const exact = await this.run(dto, 'exact');
      if (exact.total > 0) return exact;

      const fuzzy = await this.run(dto, 'fuzzy');
      return { ...fuzzy, didYouMean: await this.closestTerm(dto.q!) };
    }

    return this.run(dto, 'browse');
  }

  /** Autocomplete: a few plant names and shop names ranked by trigram similarity. */
  async suggest({ q }: SuggestDto) {
    if (!q) return { plants: [], shops: [] };

    const [plants, shops] = await Promise.all([
      this.prisma.$queryRaw<{ label: string; slug: string; sim: number }[]>`
        SELECT pl.common_name AS label, pl.slug, similarity(pl.common_name, ${q}) AS sim
        FROM plants pl
        WHERE pl.common_name % ${q}
           OR pl.common_name ILIKE ${`${q}%`}
           OR pl.scientific_name ILIKE ${`${q}%`}
        ORDER BY sim DESC, pl.common_name ASC
        LIMIT 6
      `,
      this.prisma.$queryRaw<{ label: string; slug: string; sim: number }[]>`
        SELECT v.name AS label, v.slug, similarity(v.name, ${q}) AS sim
        FROM vendors v
        WHERE v.approved = true AND v.suspended = false
          AND (v.name % ${q} OR v.name ILIKE ${`%${q}%`})
        ORDER BY sim DESC, v.name ASC
        LIMIT 3
      `,
    ]);

    return {
      plants: plants.map(({ label, slug }) => ({ label, slug })),
      shops: shops.map(({ label, slug }) => ({ label, slug })),
    };
  }

  // ── internals ───────────────────────────────────────────────────

  private async run(dto: SearchProductsDto, strategy: SearchStrategy) {
    const origin = this.origin(dto);
    const match = this.matchClause(dto, strategy);
    const where = Prisma.join([...this.filters(dto, origin), ...(match ? [match] : [])], ' AND ');
    const score = this.scoreExpression(dto, strategy, origin);
    const distance = origin
      ? Prisma.sql`ST_Distance(v.location, ${origin})`
      : Prisma.sql`NULL::float8`;
    const delivers = origin
      ? Prisma.sql`ST_DWithin(v.location, ${origin}, v.delivery_radius_km * 1000)`
      : Prisma.sql`NULL::boolean`;

    const rows = await this.prisma.$queryRaw<ResultRow[]>`
      SELECT
        p.id, p.title, p.description, p.price, p.stock, p.pot_size, p.images,
        pl.id AS plant_id, pl.common_name, pl.scientific_name, pl.slug AS plant_slug,
        pl.sunlight::text, pl.water::text, pl.difficulty::text, pl.placement::text,
        pl.pet_friendly, pl.air_purifying, pl.flowering_plant, pl.image_url,
        v.id AS vendor_id, v.name AS vendor_name, v.slug AS vendor_slug,
        v.rating_avg, v.rating_count,
        ${distance} AS distance_m,
        ${delivers} AS delivers,
        ${score} AS score
      FROM products p
      JOIN plants pl ON pl.id = p.plant_id
      JOIN vendors v ON v.id = p.vendor_id
      WHERE ${where}
      ORDER BY ${this.orderBy(dto, strategy)}
      LIMIT ${dto.pageSize} OFFSET ${(dto.page - 1) * dto.pageSize}
    `;

    const [[{ count }], facets] = await Promise.all([
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM products p
        JOIN plants pl ON pl.id = p.plant_id
        JOIN vendors v ON v.id = p.vendor_id
        WHERE ${where}
      `,
      this.facets(where),
    ]);

    return {
      items: rows.map((row) => this.toResult(row)),
      total: Number(count),
      page: dto.page,
      pageSize: dto.pageSize,
      strategy,
      query: dto.q ?? null,
      /** Only populated when the fuzzy tier ran; null otherwise. */
      didYouMean: null as string | null,
      facets,
    };
  }

  /**
   * Relevance is a sum of named components rather than one opaque expression —
   * each can be tuned or explained on its own, and a semantic (pgvector) score
   * would slot in here as one more term.
   */
  private scoreExpression(
    dto: SearchProductsDto,
    strategy: SearchStrategy,
    origin: Prisma.Sql | null,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [];

    if (strategy === 'exact' && dto.q) {
      const query = Prisma.sql`websearch_to_tsquery('english', ${dto.q})`;
      // Listing title outranks the species blurb: 1.0 vs 0.6.
      parts.push(Prisma.sql`ts_rank_cd(p.search_vector, ${query}) * 1.0`);
      parts.push(Prisma.sql`ts_rank_cd(pl.search_vector, ${query}) * 0.6`);
    } else if (strategy === 'fuzzy' && dto.q) {
      parts.push(Prisma.sql`GREATEST(
        similarity(p.title, ${dto.q}),
        similarity(pl.common_name, ${dto.q}),
        similarity(pl.scientific_name, ${dto.q})
      )`);
    } else {
      parts.push(Prisma.sql`0::float8`);
    }

    // A small, capped nudge — reputation should break ties, not bury relevance.
    parts.push(Prisma.sql`LEAST(v.rating_avg, 5) * 0.02`);

    // Closer shops score higher, tapering to zero at the edge of the radius.
    if (origin && dto.radiusKm) {
      parts.push(Prisma.sql`GREATEST(
        0, 1 - (ST_Distance(v.location, ${origin}) / ${dto.radiusKm * KM}::float8)
      ) * 0.3`);
    }

    return Prisma.join(parts, ' + ');
  }

  private matchClause(dto: SearchProductsDto, strategy: SearchStrategy): Prisma.Sql | null {
    if (!dto.q) return null;

    if (strategy === 'exact') {
      const query = Prisma.sql`websearch_to_tsquery('english', ${dto.q})`;
      return Prisma.sql`(p.search_vector @@ ${query} OR pl.search_vector @@ ${query})`;
    }

    if (strategy === 'fuzzy') {
      return Prisma.sql`(
        similarity(p.title, ${dto.q}) > ${FUZZY_THRESHOLD}
        OR similarity(pl.common_name, ${dto.q}) > ${FUZZY_THRESHOLD}
        OR similarity(pl.scientific_name, ${dto.q}) > ${FUZZY_THRESHOLD}
      )`;
    }

    return null;
  }

  private filters(dto: SearchProductsDto, origin: Prisma.Sql | null): Prisma.Sql[] {
    const filters: Prisma.Sql[] = [
      Prisma.sql`p.active = true`,
      Prisma.sql`v.approved = true`,
      Prisma.sql`v.suspended = false`,
    ];

    if (dto.inStockOnly) filters.push(Prisma.sql`p.stock > 0`);
    if (dto.minPrice !== undefined) filters.push(Prisma.sql`p.price >= ${dto.minPrice}::numeric`);
    if (dto.maxPrice !== undefined) filters.push(Prisma.sql`p.price <= ${dto.maxPrice}::numeric`);

    const enumFilter = (column: string, values?: string[]) => {
      if (!values?.length) return;
      // Cast to text so the list can be parameterised without enum-typed binds.
      filters.push(
        Prisma.sql`${Prisma.raw(column)}::text IN (${Prisma.join(values.map((v) => Prisma.sql`${v}`))})`,
      );
    };

    enumFilter('pl.sunlight', dto.sunlight);
    enumFilter('pl.water', dto.water);
    enumFilter('pl.difficulty', dto.difficulty);
    enumFilter('pl.placement', dto.placement);

    if (dto.petFriendly !== undefined)
      filters.push(Prisma.sql`pl.pet_friendly = ${dto.petFriendly}`);
    if (dto.airPurifying !== undefined)
      filters.push(Prisma.sql`pl.air_purifying = ${dto.airPurifying}`);
    if (dto.flowering !== undefined)
      filters.push(Prisma.sql`pl.flowering_plant = ${dto.flowering}`);

    if (dto.category) {
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM plant_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.plant_id = pl.id AND c.slug = ${dto.category}
      )`);
    }

    if (origin && dto.radiusKm) {
      filters.push(Prisma.sql`v.location IS NOT NULL`);
      filters.push(Prisma.sql`ST_DWithin(v.location, ${origin}, ${dto.radiusKm * KM}::float8)`);
    }

    return filters;
  }

  private orderBy(dto: SearchProductsDto, strategy: SearchStrategy): Prisma.Sql {
    switch (dto.sort) {
      case 'price_asc':
        return Prisma.sql`p.price ASC, p.id ASC`;
      case 'price_desc':
        return Prisma.sql`p.price DESC, p.id ASC`;
      case 'rating':
        return Prisma.sql`v.rating_avg DESC, v.rating_count DESC, p.id ASC`;
      case 'distance':
        return Prisma.sql`distance_m ASC NULLS LAST, p.id ASC`;
      default:
        // Without a search term "relevance" is meaningless — fall back to
        // something stable and useful instead of an arbitrary heap order.
        return strategy === 'browse'
          ? Prisma.sql`v.rating_avg DESC, p.price ASC, p.id ASC`
          : Prisma.sql`score DESC, p.price ASC, p.id ASC`;
    }
  }

  /**
   * Counts for the filter sidebar, computed over the *current* result set so the
   * numbers always match what clicking through would show.
   */
  private async facets(where: Prisma.Sql) {
    const [row] = await this.prisma.$queryRaw<[Record<string, bigint | string | null>]>`
      SELECT
        COUNT(*) FILTER (WHERE pl.placement IN ('INDOOR', 'BOTH'))::bigint AS indoor,
        COUNT(*) FILTER (WHERE pl.placement IN ('OUTDOOR', 'BOTH'))::bigint AS outdoor,
        COUNT(*) FILTER (WHERE pl.difficulty = 'EASY')::bigint AS easy,
        COUNT(*) FILTER (WHERE pl.difficulty = 'MODERATE')::bigint AS moderate,
        COUNT(*) FILTER (WHERE pl.difficulty = 'HARD')::bigint AS hard,
        COUNT(*) FILTER (WHERE pl.pet_friendly)::bigint AS pet_friendly,
        COUNT(*) FILTER (WHERE pl.air_purifying)::bigint AS air_purifying,
        COUNT(*) FILTER (WHERE pl.flowering_plant)::bigint AS flowering,
        COUNT(*) FILTER (WHERE pl.water = 'LOW')::bigint AS low_water,
        MIN(p.price)::text AS min_price,
        MAX(p.price)::text AS max_price
      FROM products p
      JOIN plants pl ON pl.id = p.plant_id
      JOIN vendors v ON v.id = p.vendor_id
      WHERE ${where}
    `;

    const num = (key: string) => Number(row[key] ?? 0);
    return {
      placement: { indoor: num('indoor'), outdoor: num('outdoor') },
      difficulty: { easy: num('easy'), moderate: num('moderate'), hard: num('hard') },
      traits: {
        petFriendly: num('pet_friendly'),
        airPurifying: num('air_purifying'),
        flowering: num('flowering'),
        lowWater: num('low_water'),
      },
      price: {
        min: (row.min_price as string | null) ?? null,
        max: (row.max_price as string | null) ?? null,
      },
    };
  }

  /** The closest catalogue term to a failed search — powers "did you mean …?". */
  private async closestTerm(q: string): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<{ label: string; sim: number }[]>`
      SELECT pl.common_name AS label, similarity(pl.common_name, ${q}) AS sim
      FROM plants pl
      ORDER BY sim DESC
      LIMIT 1
    `;
    return row && row.sim > 0.2 ? row.label : null;
  }

  private origin(dto: SearchProductsDto): Prisma.Sql | null {
    if (dto.lat === undefined || dto.lng === undefined) return null;
    return Prisma.sql`ST_SetSRID(ST_MakePoint(${dto.lng}::float8, ${dto.lat}::float8), 4326)::geography`;
  }

  private toResult(row: ResultRow) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      stock: row.stock,
      potSize: row.pot_size,
      image: row.images?.[0] ?? row.image_url ?? null,
      score: Number(row.score),
      plant: {
        id: row.plant_id,
        commonName: row.common_name,
        scientificName: row.scientific_name,
        slug: row.plant_slug,
        sunlight: row.sunlight,
        water: row.water,
        difficulty: row.difficulty,
        placement: row.placement,
        petFriendly: row.pet_friendly,
        airPurifying: row.air_purifying,
        flowering: row.flowering_plant,
      },
      vendor: {
        id: row.vendor_id,
        name: row.vendor_name,
        slug: row.vendor_slug,
        ratingAvg: row.rating_avg,
        ratingCount: row.rating_count,
      },
      distanceKm: row.distance_m === null ? null : Math.round((row.distance_m / KM) * 10) / 10,
      deliversToYou: row.delivers,
    };
  }
}
