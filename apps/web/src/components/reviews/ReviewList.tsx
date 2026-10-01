import type { ShopReviews } from '@/lib/review-types';
import { Stars } from './Stars';

/** A shop's rating summary plus its most recent reviews. */
export function ReviewList({ data }: { data: ShopReviews }) {
  const { vendor, items, breakdown } = data;

  if (vendor.ratingCount === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No reviews yet. Buy something and you can be the first.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <div className="text-center">
          <div className="text-3xl font-bold">{vendor.ratingAvg.toFixed(1)}</div>
          <Stars value={vendor.ratingAvg} />
          <div className="mt-1 text-xs text-zinc-500">
            {vendor.ratingCount} review{vendor.ratingCount === 1 ? '' : 's'}
          </div>
        </div>

        <ul className="min-w-[180px] flex-1 space-y-1">
          {breakdown.map((row) => {
            const share = vendor.ratingCount ? (row.count / vendor.ratingCount) * 100 : 0;
            return (
              <li key={row.rating} className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="w-3 tabular-nums">{row.rating}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <span className="block h-full bg-amber-500" style={{ width: `${share}%` }} />
                </span>
                <span className="w-6 text-right tabular-nums">{row.count}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="space-y-3">
        {items.map((review) => (
          <li
            key={review.id}
            className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{review.author.name}</span>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                <Stars value={review.rating} />
                {new Date(review.createdAt).toLocaleDateString('en-IN')}
              </span>
            </div>
            {review.product && (
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                on {review.product.title}
              </p>
            )}
            {review.comment && (
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">{review.comment}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
