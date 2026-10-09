'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { Cart } from '@/lib/cart-types';
import { rupees } from '@/lib/vendor-types';

/**
 * The cart is shown split by shop, because that is exactly how it will be
 * ordered: each shop packs, charges delivery and fulfils independently.
 */
export function CartView({ initial }: { initial: Cart }) {
  const router = useRouter();
  const [cart, setCart] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (lineId: string, action: () => Promise<Cart>) => {
    setBusy(lineId);
    setError(null);
    try {
      setCart(await action());
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update the cart');
    } finally {
      setBusy(null);
    }
  };

  const setQuantity = (lineId: string, quantity: number) =>
    mutate(lineId, () => api.patch<Cart>(`/api/cart/items/${lineId}`, { quantity }));

  const remove = (lineId: string) =>
    mutate(lineId, () => api.delete<Cart>(`/api/cart/items/${lineId}`));

  if (cart.lineCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
        <p className="text-lg font-medium">Your cart is empty</p>
        <p className="mt-1 text-sm text-zinc-500">Find something green to bring home.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="/search"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Browse plants
          </Link>
          <Link
            href="/nearby"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Nurseries near me
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </p>
        )}

        {cart.vendorGroups.map((group) => (
          <section
            key={group.vendorId}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          >
            <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <Link
                href={`/shops/${group.vendorSlug}`}
                className="text-sm font-medium hover:underline"
              >
                🏪 {group.vendorName}
              </Link>
              <span className="text-xs text-zinc-500">
                {Number(group.deliveryFee) === 0
                  ? 'Free delivery'
                  : `+ ${rupees(group.deliveryFee)} delivery`}
              </span>
            </header>

            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {group.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.title}</p>
                    <p className="truncate text-xs text-zinc-500 italic">{line.scientificName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {rupees(line.unitPrice)} each
                      {line.stock <= 5 && (
                        <span className="ml-2 text-amber-600">only {line.stock} left</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={busy === line.id || line.quantity <= 1}
                      onClick={() => setQuantity(line.id, line.quantity - 1)}
                      className="h-7 w-7 rounded-lg border border-zinc-200 text-sm disabled:opacity-40 dark:border-zinc-700"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={busy === line.id || line.quantity >= line.stock}
                      onClick={() => setQuantity(line.id, line.quantity + 1)}
                      className="h-7 w-7 rounded-lg border border-zinc-200 text-sm disabled:opacity-40 dark:border-zinc-700"
                    >
                      +
                    </button>
                  </div>

                  <span className="w-20 text-right text-sm font-medium tabular-nums">
                    {rupees(line.lineTotal)}
                  </span>

                  <button
                    type="button"
                    onClick={() => remove(line.id)}
                    disabled={busy === line.id}
                    className="text-xs text-zinc-400 hover:text-rose-600"
                    aria-label={`Remove ${line.title}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <footer className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-zinc-500">
                Subtotal {rupees(group.subtotal)} · shop total {rupees(group.total)}
              </span>
              {group.belowMinimum && (
                <span className="font-medium text-amber-600">
                  {rupees(group.minOrderValue)} minimum
                </span>
              )}
            </footer>
          </section>
        ))}
      </div>

      {/* ── Summary ─────────────────────────────────────────── */}
      <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 lg:sticky lg:top-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">Order summary</h2>

        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label={`Items (${cart.itemCount})`} value={rupees(cart.itemsTotal)} />
          <Row
            label={`Delivery · ${cart.vendorGroups.length} ${cart.vendorGroups.length === 1 ? 'shop' : 'shops'}`}
            value={rupees(cart.deliveryTotal)}
          />
          <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold dark:border-zinc-800">
            <dt>Total</dt>
            <dd>{rupees(cart.grandTotal)}</dd>
          </div>
        </dl>

        {cart.vendorGroups.length > 1 && (
          <p className="mt-2 text-xs text-zinc-500">
            Ordering from {cart.vendorGroups.length} shops — each delivers separately, so you pay a
            delivery fee per shop.
          </p>
        )}

        {cart.issues.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {cart.issues.map((issue, index) => (
              <li
                key={`${issue.code}-${index}`}
                className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/checkout"
          aria-disabled={!cart.checkoutReady}
          className={`mt-4 block rounded-xl px-4 py-2.5 text-center text-sm font-medium transition ${
            cart.checkoutReady
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'pointer-events-none bg-zinc-200 text-zinc-500 dark:bg-zinc-800'
          }`}
        >
          {cart.checkoutReady ? 'Checkout' : 'Fix the issues above'}
        </Link>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
