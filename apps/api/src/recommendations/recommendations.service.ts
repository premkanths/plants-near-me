import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineKm } from './geo';
import { LlmGateway } from './llm.gateway';
import {
  buildProfile,
  recommend,
  similarity,
  type CandidateProduct,
  type PurchasedItem,
  type TasteProfile,
} from './recommendation-rules';

/** How many listings the rules get to choose from. */
const CANDIDATE_POOL = 200;

export interface Recommendation {
  productId: string;
  title: string;
  price: string;
  stock: number;
  imageUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  plant: { id: string; name: string; scientificName: string };
  vendor: { id: string; name: string; slug: string };
  distanceKm: number | null;
  score: number;
  reasons: string[];
  /** Present only when the LLM layer rewrote the blurb. */
  blurb?: string;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGateway,
  ) {}

  async forUser(
    userId: string | null,
    options: { lat?: number; lng?: number; limit: number; explain: boolean },
  ) {
    const profile = userId ? await this.profileFor(userId) : emptyProfile();
    const candidates = await this.candidates(options.lat, options.lng);
    const picked = recommend(profile, candidates, options.limit);

    const items = picked.map((entry) =>
      toRecommendation(entry.product, entry.score, entry.reasons),
    );
    const explained = options.explain ? await this.addBlurbs(profile, items) : items;

    return {
      strategy: profile.sampleSize > 0 ? 'personalised' : 'popular',
      personalised: profile.sampleSize > 0,
      basedOn: profile.sampleSize,
      llm: this.llm.available && options.explain,
      items: explained,
    };
  }

  /** "More like this" — content-based, no history required. */
  async similarTo(productId: string, limit: number) {
    const seedRow = await this.prisma.product.findFirst({
      where: { id: productId, active: true },
      select: productSelect,
    });
    if (!seedRow) throw new NotFoundException('Listing not found');

    const seed = toCandidate(seedRow, null);
    const candidates = await this.candidates();

    const ranked = candidates
      .filter((candidate) => candidate.plantId !== seed.plantId && candidate.stock > 0)
      .map((candidate) => ({ candidate, score: similarity(seed, candidate) }))
      .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

    const seenPlants = new Set<string>();
    const items: Recommendation[] = [];
    for (const { candidate, score } of ranked) {
      if (items.length >= limit) break;
      if (seenPlants.has(candidate.plantId)) continue;
      seenPlants.add(candidate.plantId);
      items.push(toRecommendation(candidate, score, reasonsForSimilarity(seed, candidate)));
    }

    return {
      seed: {
        productId: seed.id,
        title: seed.title,
        plant: { id: seed.plantId, name: seed.plantName },
      },
      items,
    };
  }

  // ───────────────────────── internals ─────────────────────────

  /** Purchase history plus ratings given, folded into a taste profile. */
  private async profileFor(userId: string): Promise<TasteProfile> {
    const [orderItems, reviews] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: {
          vendorOrder: {
            status: { not: 'REJECTED' },
            masterOrder: { customerId: userId, status: { not: 'PENDING_PAYMENT' } },
          },
        },
        orderBy: { vendorOrder: { createdAt: 'desc' } },
        take: 100,
        select: {
          unitPrice: true,
          vendorOrder: { select: { vendorId: true } },
          product: {
            select: {
              plant: {
                select: {
                  id: true,
                  sunlight: true,
                  water: true,
                  difficulty: true,
                  placement: true,
                  petFriendly: true,
                  airPurifying: true,
                  categories: { select: { categoryId: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.review.findMany({
        where: { authorId: userId },
        select: { vendorId: true, rating: true },
      }),
    ]);

    const purchased: PurchasedItem[] = orderItems.map((item) => ({
      plantId: item.product.plant.id,
      unitPrice: Number(item.unitPrice),
      vendorId: item.vendorOrder.vendorId,
      sunlight: item.product.plant.sunlight,
      water: item.product.plant.water,
      difficulty: item.product.plant.difficulty,
      placement: item.product.plant.placement,
      petFriendly: item.product.plant.petFriendly,
      airPurifying: item.product.plant.airPurifying,
      categoryIds: item.product.plant.categories.map((link) => link.categoryId),
    }));

    return buildProfile(purchased, reviews);
  }

  /**
   * Candidate listings: in stock, from a live shop, and — when the customer
   * shared a location — only from shops that actually deliver there. No point
   * recommending a plant that cannot reach the buyer.
   */
  private async candidates(lat?: number, lng?: number): Promise<CandidateProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        active: true,
        stock: { gt: 0 },
        vendor: { approved: true, suspended: false },
      },
      orderBy: [{ ratingAvg: 'desc' }, { createdAt: 'desc' }],
      take: CANDIDATE_POOL,
      select: productSelect,
    });

    const sales = await this.unitsSold(rows.map((row) => row.id));
    const point = lat !== undefined && lng !== undefined ? { lat, lng } : null;

    return rows
      .map((row) => {
        const distanceKm = point
          ? haversineKm(point, { lat: row.vendor.latitude, lng: row.vendor.longitude })
          : null;
        return { row, distanceKm };
      })
      .filter(
        ({ row, distanceKm }) => distanceKm === null || distanceKm <= row.vendor.deliveryRadiusKm,
      )
      .map(({ row, distanceKm }) => toCandidate(row, distanceKm, sales.get(row.id) ?? 0));
  }

  private async unitsSold(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, vendorOrder: { status: { not: 'REJECTED' } } },
      _sum: { quantity: true },
    });

    return new Map(grouped.map((row) => [row.productId, row._sum.quantity ?? 0]));
  }

  /** Replaces the rule-based reason list with one LLM-written line, if we can. */
  private async addBlurbs(profile: TasteProfile, items: Recommendation[]) {
    if (!this.llm.available || items.length === 0) return items;

    const blurbs = await this.llm.explain({
      shopper: describeShopper(profile),
      items: items.map((item) => ({
        id: item.productId,
        plant: item.plant.name,
        facts: item.reasons,
      })),
    });

    return items.map((item) => {
      const blurb = blurbs.get(item.productId);
      return blurb ? { ...item, blurb } : item;
    });
  }
}

const productSelect = {
  id: true,
  title: true,
  price: true,
  stock: true,
  images: true,
  ratingAvg: true,
  ratingCount: true,
  vendor: {
    select: {
      id: true,
      name: true,
      slug: true,
      latitude: true,
      longitude: true,
      deliveryRadiusKm: true,
      ratingAvg: true,
    },
  },
  plant: {
    select: {
      id: true,
      commonName: true,
      scientificName: true,
      sunlight: true,
      water: true,
      difficulty: true,
      placement: true,
      petFriendly: true,
      airPurifying: true,
      floweringPlant: true,
      imageUrl: true,
      categories: { select: { categoryId: true } },
    },
  },
} as const;

type ProductRow = {
  id: string;
  title: string;
  price: unknown;
  stock: number;
  images: string[];
  ratingAvg: number;
  ratingCount: number;
  vendor: {
    id: string;
    name: string;
    slug: string;
    latitude: number;
    longitude: number;
    deliveryRadiusKm: number;
    ratingAvg: number;
  };
  plant: {
    id: string;
    commonName: string;
    scientificName: string;
    sunlight: CandidateProduct['sunlight'];
    water: CandidateProduct['water'];
    difficulty: CandidateProduct['difficulty'];
    placement: CandidateProduct['placement'];
    petFriendly: boolean;
    airPurifying: boolean;
    floweringPlant: boolean;
    imageUrl: string | null;
    categories: { categoryId: string }[];
  };
};

function toCandidate(row: ProductRow, distanceKm: number | null, unitsSold = 0): CandidateProduct {
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    stock: row.stock,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    unitsSold,
    vendorId: row.vendor.id,
    vendorName: row.vendor.name,
    vendorSlug: row.vendor.slug,
    vendorRatingAvg: row.vendor.ratingAvg,
    distanceKm,
    plantId: row.plant.id,
    plantName: row.plant.commonName,
    scientificName: row.plant.scientificName,
    sunlight: row.plant.sunlight,
    water: row.plant.water,
    difficulty: row.plant.difficulty,
    placement: row.plant.placement,
    petFriendly: row.plant.petFriendly,
    airPurifying: row.plant.airPurifying,
    floweringPlant: row.plant.floweringPlant,
    categoryIds: row.plant.categories.map((link) => link.categoryId),
    imageUrl: row.images[0] ?? row.plant.imageUrl,
  };
}

function toRecommendation(
  product: CandidateProduct,
  score: number,
  reasons: string[],
): Recommendation {
  return {
    productId: product.id,
    title: product.title,
    price: product.price.toFixed(2),
    stock: product.stock,
    imageUrl: product.imageUrl,
    ratingAvg: Number(product.ratingAvg.toFixed(2)),
    ratingCount: product.ratingCount,
    plant: { id: product.plantId, name: product.plantName, scientificName: product.scientificName },
    vendor: { id: product.vendorId, name: product.vendorName, slug: product.vendorSlug },
    distanceKm: product.distanceKm === null ? null : Number(product.distanceKm.toFixed(2)),
    score,
    // Three is as many as the card can show without turning into an essay.
    reasons: reasons.slice(0, 3),
  };
}

function reasonsForSimilarity(seed: CandidateProduct, other: CandidateProduct): string[] {
  const reasons: string[] = [];
  if (other.placement === seed.placement) {
    reasons.push(seed.placement === 'OUTDOOR' ? 'Also an outdoor plant' : 'Also an indoor plant');
  }
  if (other.water === seed.water) reasons.push('Same watering routine');
  if (other.difficulty === seed.difficulty) reasons.push('Similar care level');
  if (other.categoryIds.some((id) => seed.categoryIds.includes(id))) reasons.push('Same category');
  return reasons.slice(0, 3);
}

function emptyProfile(): TasteProfile {
  return buildProfile([], []);
}

/** One line of context for the LLM prompt — no personal data leaves the server. */
export function describeShopper(profile: TasteProfile): string {
  if (profile.sampleSize === 0) return 'a new shopper with no purchase history';

  const top = (counter: Record<string, number>) =>
    Object.entries(counter)
      .sort((a, b) => b[1] - a[1])[0]?.[0]
      ?.toLowerCase()
      .replace('_', ' ');

  const parts = [
    `has bought ${profile.sampleSize} plants`,
    top(profile.placement) && `mostly ${top(profile.placement)}`,
    top(profile.water) && `${top(profile.water)} watering`,
    profile.typicalSpend && `usually around ₹${Math.round(profile.typicalSpend)}`,
  ].filter(Boolean);

  return parts.join(', ');
}
