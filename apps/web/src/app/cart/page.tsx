import { CartView } from '@/components/cart/CartView';
import { RecommendationGrid } from '@/components/recommendations/RecommendationGrid';
import type { Cart } from '@/lib/cart-types';
import type { SimilarResponse } from '@/lib/recommendation-types';
import { serverApiSafe } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

const EMPTY: Cart = {
  vendorGroups: [],
  itemCount: 0,
  lineCount: 0,
  itemsTotal: '0.00',
  deliveryTotal: '0.00',
  grandTotal: '0.00',
  issues: [],
  checkoutReady: false,
};

export default async function CartPage() {
  const cart = (await serverApiSafe<Cart>('/cart')) ?? EMPTY;

  // Seed "more like this" from the first thing in the cart: content-based, so
  // it works for a first-time buyer with no history at all.
  const seedProductId = cart.vendorGroups[0]?.lines[0]?.productId;
  const similar = seedProductId
    ? await serverApiSafe<SimilarResponse>(`/recommendations/similar/${seedProductId}?limit=4`)
    : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      <CartView initial={cart} />

      {similar && similar.items.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-wider text-zinc-400 uppercase">
            Goes well with your {similar.seed.plant.name}
          </h2>
          <RecommendationGrid items={similar.items} />
        </section>
      )}
    </main>
  );
}
