export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
  vendor: { id: string; name: string; slug: string };
  product: { id: string; title: string } | null;
}

export interface ShopReviews {
  vendor: { id: string; name: string; ratingAvg: number; ratingCount: number };
  items: Review[];
  total: number;
  page: number;
  pageSize: number;
  breakdown: { rating: number; count: number }[];
}

export interface AwaitingReview {
  id: string;
  orderNumber: string;
  deliveredAt: string | null;
  vendor: { id: string; name: string; slug: string };
  items: { productId: string; productTitle: string }[];
}

export interface MyReviews {
  written: (Review & { vendorOrderId: string })[];
  awaiting: AwaitingReview[];
}

/** "4.3" with a trailing zero trimmed, or a dash when nobody has rated yet. */
export const formatRating = (value: number, count: number): string =>
  count === 0 ? '—' : value.toFixed(1);
