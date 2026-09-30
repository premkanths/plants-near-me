import { CartView } from '@/components/cart/CartView';
import type { Cart } from '@/lib/cart-types';
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      <CartView initial={cart} />
    </main>
  );
}
