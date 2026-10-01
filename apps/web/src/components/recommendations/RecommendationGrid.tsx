import Link from 'next/link';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { Stars } from '@/components/reviews/Stars';
import type { Recommendation } from '@/lib/recommendation-types';
import { rupees } from '@/lib/vendor-types';

/** A card grid of picks, each carrying the reason it was chosen. */
export function RecommendationGrid({ items }: { items: Recommendation[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Nothing to suggest yet — add a few plants to the catalogue first.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <li
          key={item.productId}
          className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h3 className="text-sm font-medium">{item.title}</h3>
          <p className="text-xs text-zinc-500 italic">{item.plant.scientificName}</p>

          <Link
            href={`/shops/${item.vendor.slug}`}
            className="mt-1 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
          >
            🏪 {item.vendor.name}
            {item.distanceKm !== null && ` · ${item.distanceKm.toFixed(1)} km`}
          </Link>

          {item.ratingCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
              <Stars value={item.ratingAvg} />
              {item.ratingAvg.toFixed(1)} ({item.ratingCount})
            </p>
          )}

          {/* The blurb is the LLM rewrite when one is available; the bullet
              list is what the rules themselves decided. */}
          {item.blurb ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{item.blurb}</p>
          ) : (
            <ul className="mt-2 space-y-0.5">
              {item.reasons.map((reason) => (
                <li key={reason} className="text-xs text-zinc-500">
                  · {reason}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{rupees(item.price)}</span>
              {item.stock <= 5 && (
                <span className="text-xs text-amber-600">Only {item.stock} left</span>
              )}
            </div>
            <AddToCartButton productId={item.productId} />
          </div>
        </li>
      ))}
    </ul>
  );
}
