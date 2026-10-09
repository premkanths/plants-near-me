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
}: {
  productId: string;
  disabled?: boolean;
  compact?: boolean;
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
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          state === 'added'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'
        } ${compact ? '' : 'w-full'}`}
      >
        {disabled
          ? 'Out of stock'
          : state === 'saving'
            ? 'Adding…'
            : state === 'added'
              ? '✓ In your cart'
              : 'Add to cart'}
      </button>

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
