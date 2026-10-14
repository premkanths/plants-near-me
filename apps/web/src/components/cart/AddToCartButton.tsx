'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';

/**
 * Adds one listing to the cart.
 *
 * A guest is sent to the login page with a `next` parameter rather than being
 * told off — the intent is kept, not discarded.
 */
export function AddToCartButton({
  productId,
  disabled = false,
  compact = false,
  title,
  price,
  vendorName,
  stock,
}: {
  productId: string;
  disabled?: boolean;
  compact?: boolean;
  title?: string;
  price?: string;
  vendorName?: string;
  stock?: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saving' | 'added'>('idle');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setState('saving');
    setError(null);

    try {
      await api.post('/api/cart/items', { productId, quantity: 1 });
      setState('added');
      router.refresh();
      setTimeout(() => setState('idle'), 1800);
    } catch (cause) {
      setState('idle');
      if (cause instanceof ApiError && cause.status === 401) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (cause instanceof ApiError && cause.status === 403) {
        setError('Only customer accounts can shop');
        return;
      }
      setError(cause instanceof ApiError ? cause.message : 'Could not add to cart');
    }
  };

  return (
    <div className={compact ? '' : 'w-full'}>
      <button
        type="button"
        onClick={add}
        disabled={disabled || state === 'saving'}
        className={`rounded-xl px-3.5 py-2 text-xs font-bold transition transform duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
          state === 'added'
            ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
            : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 hover:shadow-md'
        } ${compact ? '' : 'w-full'}`}
      >
        {disabled
          ? 'Out of stock'
          : state === 'saving'
            ? 'Adding to cart…'
            : state === 'added'
              ? '✓ In your cart'
              : 'Add to cart 🛒'}
      </button>

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
