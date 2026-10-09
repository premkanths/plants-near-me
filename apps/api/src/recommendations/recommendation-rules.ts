/**
 * The recommendation engine, as pure functions.
 *
 * Everything that decides *what* to suggest lives here with no Prisma, no
 * Nest and no network, for two reasons: it is the part most likely to be
 * wrong, and it is the part a reviewer will actually read. The service layer
 * only fetches candidates and hands them to these functions.
 *
 * The model is deliberately a transparent weighted sum rather than anything
 * clever — every point a product scores comes with a human-readable reason,
 * which is also what the UI shows the customer.
 */

export type Sunlight = 'FULL_SUN' | 'PARTIAL_SUN' | 'SHADE';
export type WaterNeed = 'LOW' | 'MEDIUM' | 'HIGH';
export type Difficulty = 'EASY' | 'MODERATE' | 'HARD';
export type Placement = 'INDOOR' | 'OUTDOOR' | 'BOTH';

export interface CandidateProduct {
  id: string;
  title: string;
  price: number;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  /** Units sold across the marketplace — popularity, not revenue. */
  unitsSold: number;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  vendorRatingAvg: number;
  /** Straight-line km from the customer, when a location was supplied. */
  distanceKm: number | null;
  plantId: string;
  plantName: string;
  scientificName: string;
  sunlight: Sunlight;
  water: WaterNeed;
  difficulty: Difficulty;
  placement: Placement;
  petFriendly: boolean;
  airPurifying: boolean;
  floweringPlant: boolean;
  categoryIds: string[];
  imageUrl: string | null;
}

/** What we think this customer likes, derived from what they bought and rated. */
export interface TasteProfile {
  /** Plants already owned — never recommend the same species twice. */
  ownedPlantIds: Set<string>;
  /** Attribute → how many purchased plants had it. */
  sunlight: Record<string, number>;
  water: Record<string, number>;
  difficulty: Record<string, number>;
  placement: Record<string, number>;
  categoryIds: Record<string, number>;
  petFriendly: number;
  airPurifying: number;
  /** Median-ish price the customer actually pays, or null when unknown. */
  typicalSpend: number | null;
  /** Shops they have bought from and rated 4+. */
  likedVendorIds: Set<string>;
  /** Number of purchased items the profile is based on. */
  sampleSize: number;
}

export interface PurchasedItem {
  plantId: string;
  unitPrice: number;
  vendorId: string;
  sunlight: Sunlight;
  water: WaterNeed;
  difficulty: Difficulty;
  placement: Placement;
  petFriendly: boolean;
  airPurifying: boolean;
  categoryIds: string[];
}

export interface ScoredProduct {
  product: CandidateProduct;
  score: number;
  reasons: string[];
}

/**
 * Weights. Kept in one object so the balance of the engine can be read (and
 * argued with) at a glance instead of being scattered through the code.
 */
export const WEIGHTS = {
  placement: 2.5,
  sunlight: 1.5,
  water: 1.5,
  difficulty: 1.2,
  category: 1.0,
  petFriendly: 1.5,
  airPurifying: 1.0,
  likedVendor: 2.0,
  priceFit: 1.5,
  quality: 3.0,
  popularity: 1.5,
  proximity: 2.0,
  lowStockPenalty: -0.5,
} as const;

/** Prior for the Bayesian rating average: a middling 3.5 with the weight of 5 reviews. */
export const RATING_PRIOR = { mean: 3.5, weight: 5 } as const;

/**
 * Shrinks a rating towards the prior so one glowing 5★ review cannot outrank a
 * shop with forty 4.6★ ones. Returns 0..1.
 */
export function qualityScore(ratingAvg: number, ratingCount: number): number {
  const { mean, weight } = RATING_PRIOR;
  const smoothed = (ratingAvg * ratingCount + mean * weight) / (ratingCount + weight);
  return Math.max(0, Math.min(1, (smoothed - 1) / 4));
}

/** Diminishing returns on sales: 0 sold → 0, ~20 sold → ~0.8. */
export function popularityScore(unitsSold: number): number {
  return Math.min(1, Math.log1p(Math.max(0, unitsSold)) / Math.log(30));
}

/** 1 at the doorstep, 0 at 15 km and beyond. Null distance is neutral (0). */
export function proximityScore(distanceKm: number | null): number {
  if (distanceKm === null || Number.isNaN(distanceKm)) return 0;
  return Math.max(0, 1 - distanceKm / 15);
}

/**
 * How well a price matches what this customer usually spends. Within ±40% is
 * a full match, falling to 0 at double or half their typical spend.
 */
export function priceFitScore(price: number, typicalSpend: number | null): number {
  if (!typicalSpend || typicalSpend <= 0 || price <= 0) return 0;
  const ratio = price / typicalSpend;
  const distance = Math.abs(Math.log(ratio));
  const tolerance = Math.log(2);
  return Math.max(0, 1 - distance / tolerance);
}

const bump = (counter: Record<string, number>, key: string) => {
  counter[key] = (counter[key] ?? 0) + 1;
};

/** Builds the taste profile from purchase history and ratings given. */
export function buildProfile(
  items: PurchasedItem[],
  ratings: { vendorId: string; rating: number }[] = [],
): TasteProfile {
  const profile: TasteProfile = {
    ownedPlantIds: new Set(),
    sunlight: {},
    water: {},
    difficulty: {},
    placement: {},
    categoryIds: {},
    petFriendly: 0,
    airPurifying: 0,
    typicalSpend: null,
    likedVendorIds: new Set(),
    sampleSize: items.length,
  };

  for (const item of items) {
    profile.ownedPlantIds.add(item.plantId);
    bump(profile.sunlight, item.sunlight);
    bump(profile.water, item.water);
    bump(profile.difficulty, item.difficulty);
    bump(profile.placement, item.placement);
    for (const categoryId of item.categoryIds) bump(profile.categoryIds, categoryId);
    if (item.petFriendly) profile.petFriendly += 1;
    if (item.airPurifying) profile.airPurifying += 1;
  }

  if (items.length > 0) {
    // Median, not mean: one expensive mature palm should not drag the whole
    // profile upmarket.
    const prices = items.map((item) => item.unitPrice).sort((a, b) => a - b);
    const middle = Math.floor(prices.length / 2);
    profile.typicalSpend =
      prices.length % 2 === 0 ? (prices[middle - 1] + prices[middle]) / 2 : prices[middle];
  }

  for (const { vendorId, rating } of ratings) {
    if (rating >= 4) profile.likedVendorIds.add(vendorId);
  }

  return profile;
}

/** Share of the profile that holds this attribute value, 0..1. */
function affinity(counter: Record<string, number>, value: string, sampleSize: number): number {
  if (sampleSize === 0) return 0;
  return (counter[value] ?? 0) / sampleSize;
}

const CARE_LABEL: Record<Difficulty, string> = {
  EASY: 'Easy to look after',
  MODERATE: 'A step up in care',
  HARD: 'One for an experienced grower',
};

/**
 * Scores one candidate against the profile and explains itself.
 *
 * `reasons` is capped by the caller, not here — the scoring stays honest and
 * the presentation layer decides how much to show.
 */
export function scoreProduct(profile: TasteProfile, product: CandidateProduct): ScoredProduct {
  const reasons: string[] = [];
  let score = 0;

  const add = (points: number, reason?: string) => {
    score += points;
    if (reason && points > 0) reasons.push(reason);
  };

  const personalised = profile.sampleSize > 0;

  if (personalised) {
    const placementFit =
      product.placement === 'BOTH'
        ? Math.max(
            affinity(profile.placement, 'INDOOR', profile.sampleSize),
            affinity(profile.placement, 'OUTDOOR', profile.sampleSize),
          )
        : affinity(profile.placement, product.placement, profile.sampleSize);
    if (placementFit > 0.3) {
      add(
        WEIGHTS.placement * placementFit,
        product.placement === 'OUTDOOR'
          ? 'Suits your outdoor spots'
          : 'Suits the indoor plants you buy',
      );
    } else {
      score += WEIGHTS.placement * placementFit;
    }

    const sunFit = affinity(profile.sunlight, product.sunlight, profile.sampleSize);
    if (sunFit > 0.4) add(WEIGHTS.sunlight * sunFit, 'Same light needs as your other plants');
    else score += WEIGHTS.sunlight * sunFit;

    const waterFit = affinity(profile.water, product.water, profile.sampleSize);
    if (waterFit > 0.4) {
      add(
        WEIGHTS.water * waterFit,
        product.water === 'LOW'
          ? 'Low watering, like your usual picks'
          : 'Matches your watering routine',
      );
    } else {
      score += WEIGHTS.water * waterFit;
    }

    const careFit = affinity(profile.difficulty, product.difficulty, profile.sampleSize);
    if (careFit > 0.4) add(WEIGHTS.difficulty * careFit, CARE_LABEL[product.difficulty]);
    else score += WEIGHTS.difficulty * careFit;

    const sharedCategories = product.categoryIds.filter((id) => profile.categoryIds[id]).length;
    if (sharedCategories > 0) {
      add(WEIGHTS.category * Math.min(1, sharedCategories / 2), 'From a category you shop in');
    }

    if (product.petFriendly && profile.petFriendly / profile.sampleSize > 0.5) {
      add(WEIGHTS.petFriendly, 'Pet-safe, like most of your plants');
    }
    if (product.airPurifying && profile.airPurifying / profile.sampleSize > 0.5) {
      add(WEIGHTS.airPurifying, 'Air purifying');
    }
    if (profile.likedVendorIds.has(product.vendorId)) {
      add(WEIGHTS.likedVendor, `You rated ${product.vendorName} highly`);
    }

    const priceFit = priceFitScore(product.price, profile.typicalSpend);
    if (priceFit > 0.6) add(WEIGHTS.priceFit * priceFit, 'In your usual price range');
    else score += WEIGHTS.priceFit * priceFit;
  } else {
    // Cold start: no history, so lean on easy-care, well-reviewed and close by.
    if (product.difficulty === 'EASY') add(WEIGHTS.difficulty, 'Easy to keep alive');
    if (product.airPurifying) add(WEIGHTS.airPurifying * 0.5, 'Air purifying');
  }

  const quality = qualityScore(product.ratingAvg, product.ratingCount);
  score += WEIGHTS.quality * quality;
  if (product.ratingCount >= 3 && product.ratingAvg >= 4) {
    reasons.push(`Rated ${product.ratingAvg.toFixed(1)} by ${product.ratingCount} buyers`);
  }

  const popularity = popularityScore(product.unitsSold);
  score += WEIGHTS.popularity * popularity;
  if (product.unitsSold >= 5) reasons.push('Popular right now');

  const proximity = proximityScore(product.distanceKm);
  score += WEIGHTS.proximity * proximity;
  if (product.distanceKm !== null && product.distanceKm <= 5) {
    reasons.push(`${product.distanceKm.toFixed(1)} km away`);
  }

  // Nudge almost-sold-out listings down: a recommendation that 404s on the
  // next click is worse than no recommendation.
  if (product.stock <= 2) score += WEIGHTS.lowStockPenalty;

  return { product, score: Number(score.toFixed(4)), reasons };
}

/**
 * Scores, filters and diversifies.
 *
 * Diversity matters more than raw score here: ten listings of the same
 * monstera from ten shops is a useless page, so at most one product per
 * species and at most two per shop survive.
 */
export function recommend(
  profile: TasteProfile,
  candidates: CandidateProduct[],
  limit: number,
  options: { maxPerVendor?: number } = {},
): ScoredProduct[] {
  const maxPerVendor = options.maxPerVendor ?? 2;

  const scored = candidates
    .filter((product) => product.stock > 0 && !profile.ownedPlantIds.has(product.plantId))
    .map((product) => scoreProduct(profile, product))
    .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));

  const seenPlants = new Set<string>();
  const perVendor = new Map<string, number>();
  const picked: ScoredProduct[] = [];

  for (const entry of scored) {
    if (picked.length >= limit) break;
    const { plantId, vendorId } = entry.product;
    if (seenPlants.has(plantId)) continue;
    if ((perVendor.get(vendorId) ?? 0) >= maxPerVendor) continue;

    seenPlants.add(plantId);
    perVendor.set(vendorId, (perVendor.get(vendorId) ?? 0) + 1);
    picked.push(entry);
  }

  return picked;
}

/**
 * Content-based similarity between two plants, 0..1. Used by "more like this",
 * where there is a seed product rather than a customer profile.
 */
export function similarity(seed: CandidateProduct, other: CandidateProduct): number {
  if (seed.plantId === other.plantId) return 1;

  const sharedCategories = other.categoryIds.filter((id) => seed.categoryIds.includes(id)).length;
  const categoryOverlap = seed.categoryIds.length
    ? sharedCategories / Math.max(seed.categoryIds.length, other.categoryIds.length)
    : 0;

  const matches = [
    [seed.placement === other.placement || other.placement === 'BOTH', 0.25],
    [seed.sunlight === other.sunlight, 0.2],
    [seed.water === other.water, 0.2],
    [seed.difficulty === other.difficulty, 0.1],
    [seed.petFriendly === other.petFriendly, 0.05],
    [seed.airPurifying === other.airPurifying, 0.05],
  ] as const;

  const attributeScore = matches.reduce((sum, [hit, weight]) => sum + (hit ? weight : 0), 0);
  const priceScore = priceFitScore(other.price, seed.price) * 0.15;

  return Number(Math.min(1, attributeScore + categoryOverlap * 0.15 + priceScore).toFixed(4));
}
