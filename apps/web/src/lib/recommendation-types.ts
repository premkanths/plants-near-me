export interface Recommendation {
  productId: string;
  title: string;
  /** Decimal as a string, like every other price in the API. */
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
  /** Only present when the optional LLM layer rewrote the reason. */
  blurb?: string;
}

export interface RecommendationResponse {
  strategy: 'personalised' | 'popular';
  personalised: boolean;
  /** How many past purchases the picks were derived from. */
  basedOn: number;
  llm: boolean;
  items: Recommendation[];
}

export interface SimilarResponse {
  seed: { productId: string; title: string; plant: { id: string; name: string } };
  items: Recommendation[];
}
