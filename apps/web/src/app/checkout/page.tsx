import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckoutForm } from '@/components/cart/CheckoutForm';
import type { Cart } from '@/lib/cart-types';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const [cart, user] = await Promise.all([serverApiSafe<Cart>('/cart'), getSessionUser()]);

  // Nothing to buy: send them back rather than showing an unusable form.
  if (!cart || cart.lineCount === 0) redirect('/cart');

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/cart" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Back to cart
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold">Checkout</h1>

      {!cart.checkoutReady && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Some items need attention before you can order — {cart.issues[0]?.message}
        </p>
      )}

      <CheckoutForm cart={cart} defaultName={user?.name ?? ''} defaultPhone={user?.phone ?? ''} />
    </main>
  );
}
