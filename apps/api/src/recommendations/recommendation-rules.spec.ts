import {
  buildProfile,
  popularityScore,
  priceFitScore,
  proximityScore,
  qualityScore,
  recommend,
  scoreProduct,
  similarity,
  type CandidateProduct,
  type PurchasedItem,
} from './recommendation-rules';

const product = (overrides: Partial<CandidateProduct> = {}): CandidateProduct => ({
  id: 'p1',
  title: 'Snake Plant (6 inch pot)',
  price: 400,
  stock: 10,
  ratingAvg: 0,
  ratingCount: 0,
  unitsSold: 0,
  vendorId: 'v1',
  vendorName: 'Lalbagh Green',
  vendorSlug: 'lalbagh-green',
  vendorRatingAvg: 0,
  distanceKm: null,
  plantId: 'plant1',
  plantName: 'Snake Plant',
  scientificName: 'Dracaena trifasciata',
  sunlight: 'PARTIAL_SUN',
  water: 'LOW',
  difficulty: 'EASY',
  placement: 'INDOOR',
  petFriendly: false,
  airPurifying: true,
  floweringPlant: false,
  categoryIds: ['c-indoor'],
  imageUrl: null,
  ...overrides,
});

const purchase = (overrides: Partial<PurchasedItem> = {}): PurchasedItem => ({
  plantId: 'bought1',
  unitPrice: 400,
  vendorId: 'v1',
  sunlight: 'PARTIAL_SUN',
  water: 'LOW',
  difficulty: 'EASY',
  placement: 'INDOOR',
  petFriendly: false,
  airPurifying: true,
  categoryIds: ['c-indoor'],
  ...overrides,
});

describe('scoring primitives', () => {
  describe('qualityScore', () => {
    it('is neutral when nobody has rated yet', () => {
      // The prior (3.5) dominates, so an unrated listing sits mid-table
      // instead of at the bottom or, worse, the top.
      expect(qualityScore(0, 0)).toBeCloseTo(0.625, 3);
    });

    it('does not let a single 5-star review beat a well-reviewed shop', () => {
      expect(qualityScore(5, 1)).toBeLessThan(qualityScore(4.6, 40));
    });

    it('rises with consistent high ratings', () => {
      expect(qualityScore(4.8, 50)).toBeGreaterThan(qualityScore(4.8, 5));
    });

    it('stays within 0..1', () => {
      expect(qualityScore(5, 10_000)).toBeLessThanOrEqual(1);
      expect(qualityScore(1, 10_000)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('popularityScore', () => {
    it('is zero for something nobody bought', () => {
      expect(popularityScore(0)).toBe(0);
    });

    it('has diminishing returns', () => {
      const first = popularityScore(5) - popularityScore(0);
      const later = popularityScore(105) - popularityScore(100);
      expect(later).toBeLessThan(first);
    });

    it('is capped at 1', () => {
      expect(popularityScore(100_000)).toBe(1);
    });

    it('ignores nonsense negatives', () => {
      expect(popularityScore(-5)).toBe(0);
    });
  });

  describe('proximityScore', () => {
    it('is neutral when the customer did not share a location', () => {
      expect(proximityScore(null)).toBe(0);
    });

    it('rewards the doorstep and ignores anything past 15 km', () => {
      expect(proximityScore(0)).toBe(1);
      expect(proximityScore(7.5)).toBeCloseTo(0.5, 5);
      expect(proximityScore(20)).toBe(0);
    });
  });

  describe('priceFitScore', () => {
    it('is unknown-safe', () => {
      expect(priceFitScore(400, null)).toBe(0);
      expect(priceFitScore(400, 0)).toBe(0);
    });

    it('peaks at the customer’s usual spend', () => {
      expect(priceFitScore(400, 400)).toBe(1);
    });

    it('treats double and half the price as equally far away', () => {
      expect(priceFitScore(800, 400)).toBeCloseTo(priceFitScore(200, 400), 5);
    });

    it('bottoms out beyond 2x', () => {
      expect(priceFitScore(5000, 400)).toBe(0);
    });
  });
});

describe('buildProfile', () => {
  it('describes a shopper with no history as empty, not wrong', () => {
    const profile = buildProfile([]);

    expect(profile.sampleSize).toBe(0);
    expect(profile.typicalSpend).toBeNull();
    expect(profile.ownedPlantIds.size).toBe(0);
  });

  it('counts attributes across purchases', () => {
    const profile = buildProfile([
      purchase({ plantId: 'a', water: 'LOW' }),
      purchase({ plantId: 'b', water: 'LOW' }),
      purchase({ plantId: 'c', water: 'HIGH' }),
    ]);

    expect(profile.sampleSize).toBe(3);
    expect(profile.water).toEqual({ LOW: 2, HIGH: 1 });
    expect(profile.ownedPlantIds.has('b')).toBe(true);
  });

  it('uses the median spend so one splurge does not skew the profile', () => {
    const profile = buildProfile([
      purchase({ plantId: 'a', unitPrice: 300 }),
      purchase({ plantId: 'b', unitPrice: 400 }),
      purchase({ plantId: 'c', unitPrice: 9000 }),
    ]);

    expect(profile.typicalSpend).toBe(400);
  });

  it('averages the middle pair for an even history', () => {
    const profile = buildProfile([
      purchase({ plantId: 'a', unitPrice: 200 }),
      purchase({ plantId: 'b', unitPrice: 400 }),
    ]);

    expect(profile.typicalSpend).toBe(300);
  });

  it('remembers only shops the customer actually rated well', () => {
    const profile = buildProfile(
      [purchase()],
      [
        { vendorId: 'v1', rating: 5 },
        { vendorId: 'v2', rating: 2 },
      ],
    );

    expect(profile.likedVendorIds.has('v1')).toBe(true);
    expect(profile.likedVendorIds.has('v2')).toBe(false);
  });
});

describe('scoreProduct', () => {
  it('explains a cold-start pick in plain language', () => {
    const { reasons } = scoreProduct(buildProfile([]), product({ difficulty: 'EASY' }));

    expect(reasons).toContain('Easy to keep alive');
  });

  it('prefers easy plants for a brand new shopper', () => {
    const cold = buildProfile([]);
    const easy = scoreProduct(cold, product({ difficulty: 'EASY' })).score;
    const hard = scoreProduct(cold, product({ difficulty: 'HARD', airPurifying: false })).score;

    expect(easy).toBeGreaterThan(hard);
  });

  it('matches a returning customer’s habits over a generic bestseller', () => {
    const profile = buildProfile([
      purchase({ plantId: 'a', placement: 'INDOOR', water: 'LOW' }),
      purchase({ plantId: 'b', placement: 'INDOOR', water: 'LOW' }),
    ]);

    const onTaste = scoreProduct(profile, product({ placement: 'INDOOR', water: 'LOW' })).score;
    const offTaste = scoreProduct(
      profile,
      product({ id: 'p2', placement: 'OUTDOOR', water: 'HIGH', sunlight: 'FULL_SUN' }),
    ).score;

    expect(onTaste).toBeGreaterThan(offTaste);
  });

  it('credits a shop the customer rated highly', () => {
    const profile = buildProfile([purchase()], [{ vendorId: 'v1', rating: 5 }]);

    const { reasons } = scoreProduct(profile, product({ vendorId: 'v1' }));

    expect(reasons).toContain('You rated Lalbagh Green highly');
  });

  it('mentions distance only when the shop is genuinely close', () => {
    const cold = buildProfile([]);

    expect(scoreProduct(cold, product({ distanceKm: 2.4 })).reasons).toContain('2.4 km away');
    expect(scoreProduct(cold, product({ distanceKm: 12 })).reasons.join()).not.toContain('km away');
  });

  it('only claims a rating when enough people have rated', () => {
    const cold = buildProfile([]);

    expect(scoreProduct(cold, product({ ratingAvg: 4.5, ratingCount: 8 })).reasons).toContain(
      'Rated 4.5 by 8 buyers',
    );
    expect(
      scoreProduct(cold, product({ ratingAvg: 5, ratingCount: 1 })).reasons.join(),
    ).not.toContain('Rated');
  });

  it('pushes nearly-sold-out listings down', () => {
    const cold = buildProfile([]);
    const plenty = scoreProduct(cold, product({ stock: 20 })).score;
    const almostGone = scoreProduct(cold, product({ stock: 1 })).score;

    expect(almostGone).toBeLessThan(plenty);
  });

  it('never invents a reason for a rule that scored nothing', () => {
    const { reasons } = scoreProduct(buildProfile([]), product({ difficulty: 'HARD' }));

    expect(reasons).not.toContain('Easy to keep alive');
  });
});

describe('recommend', () => {
  const cold = buildProfile([]);

  it('never suggests a plant the customer already owns', () => {
    const profile = buildProfile([purchase({ plantId: 'plant1' })]);

    const picks = recommend(profile, [product({ plantId: 'plant1' })], 5);

    expect(picks).toHaveLength(0);
  });

  it('drops out-of-stock listings', () => {
    const picks = recommend(cold, [product({ stock: 0 })], 5);

    expect(picks).toHaveLength(0);
  });

  it('shows one listing per species, not ten of the same monstera', () => {
    const picks = recommend(
      cold,
      [
        product({ id: 'a', plantId: 'monstera', vendorId: 'v1' }),
        product({ id: 'b', plantId: 'monstera', vendorId: 'v2' }),
        product({ id: 'c', plantId: 'fern', vendorId: 'v3' }),
      ],
      5,
    );

    expect(picks.map((pick) => pick.product.plantId)).toEqual(['monstera', 'fern']);
  });

  it('caps how much of the page one shop can occupy', () => {
    const picks = recommend(
      cold,
      [
        product({ id: 'a', plantId: 'p-a', vendorId: 'v1' }),
        product({ id: 'b', plantId: 'p-b', vendorId: 'v1' }),
        product({ id: 'c', plantId: 'p-c', vendorId: 'v1' }),
        product({ id: 'd', plantId: 'p-d', vendorId: 'v2' }),
      ],
      4,
    );

    expect(picks.filter((pick) => pick.product.vendorId === 'v1')).toHaveLength(2);
    expect(picks).toHaveLength(3);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      product({ id: `p${index}`, plantId: `plant${index}`, vendorId: `v${index}` }),
    );

    expect(recommend(cold, many, 6)).toHaveLength(6);
  });

  it('returns the best first', () => {
    const picks = recommend(
      cold,
      [
        product({
          id: 'meh',
          plantId: 'a',
          vendorId: 'v1',
          difficulty: 'HARD',
          airPurifying: false,
        }),
        product({
          id: 'great',
          plantId: 'b',
          vendorId: 'v2',
          ratingAvg: 4.9,
          ratingCount: 30,
          unitsSold: 40,
        }),
      ],
      2,
    );

    expect(picks[0].product.id).toBe('great');
    expect(picks[0].score).toBeGreaterThan(picks[1].score);
  });

  it('is deterministic for equally good candidates', () => {
    const pool = [
      product({ id: 'b', plantId: 'p-b', vendorId: 'v2' }),
      product({ id: 'a', plantId: 'p-a', vendorId: 'v1' }),
    ];

    expect(recommend(cold, pool, 2).map((pick) => pick.product.id)).toEqual(['a', 'b']);
  });
});

describe('similarity', () => {
  const seed = product({ plantId: 'seed', categoryIds: ['c-indoor', 'c-low-light'] });

  it('is 1 for the same species', () => {
    expect(similarity(seed, product({ plantId: 'seed' }))).toBe(1);
  });

  it('ranks a close match above an unrelated plant', () => {
    const close = product({
      id: 'close',
      plantId: 'other',
      categoryIds: ['c-indoor'],
    });
    const far = product({
      id: 'far',
      plantId: 'far',
      placement: 'OUTDOOR',
      sunlight: 'FULL_SUN',
      water: 'HIGH',
      difficulty: 'HARD',
      price: 5000,
      categoryIds: ['c-outdoor'],
    });

    expect(similarity(seed, close)).toBeGreaterThan(similarity(seed, far));
  });

  it('stays within 0..1', () => {
    const twin = product({ plantId: 'twin', categoryIds: ['c-indoor', 'c-low-light'] });

    const value = similarity(seed, twin);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
