'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { AwaitingReview } from '@/lib/review-types';
import { StarPicker } from './StarPicker';

/**
 * Write one review for a delivered order.
 *
 * The customer may rate the shop overall or pick one plant from that order —
 * the dropdown is built from the order's own lines, so it cannot offer
 * something the API would reject.
 */
export function ReviewForm({ order }: { order: AwaitingReview }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rating === 0) {
      setError('Pick a rating first');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post('/api/reviews', {
        vendorOrderId: order.id,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(productId ? { productId } : {}),
      });
      setDone(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your review');
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        Thanks — your review of {order.vendor.name} is live.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">🏪 {order.vendor.name}</p>
          <p className="text-xs text-zinc-500">{order.orderNumber}</p>
        </div>
        <StarPicker value={rating} onChange={setRating} disabled={busy} />
      </div>

      {order.items.length > 0 && (
        <label className="mb-3 block text-xs text-zinc-500">
          Reviewing
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
          >
            <option value="">The shop overall</option>
            {order.items.map((item) => (
              <option key={item.productId} value={item.productId}>
                {item.productTitle}
              </option>
            ))}
          </select>
        </label>
      )}

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        disabled={busy}
        rows={3}
        maxLength={1000}
        placeholder="How were the plants? Anything the next buyer should know?"
        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Posting…' : 'Post review'}
      </button>
    </form>
  );
}
