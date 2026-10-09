import Link from 'next/link';
import { notFound } from 'next/navigation';
import { distanceLabel, type ShopDetail } from '@/lib/discovery-types';
import { ReviewList } from '@/components/reviews/ReviewList';
import { Stars } from '@/components/reviews/Stars';
import type { ShopReviews } from '@/lib/review-types';
import { serverApiSafe } from '@/lib/server-api';
import { rupees } from '@/lib/vendor-types';
import { AddToCartButton } from '@/components/cart/AddToCartButton';

export const dynamic = 'force-dynamic';

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const { slug } = await params;
  const { lat, lng } = await searchParams;

  const point = lat && lng ? `?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}` : '';
  const shop = await serverApiSafe<ShopDetail>(`/shops/${encodeURIComponent(slug)}${point}`);
  if (!shop) notFound();

  const reviews = await serverApiSafe<ShopReviews>(
    `/reviews/shop/${encodeURIComponent(slug)}?pageSize=10`,
  );

  const inStock = shop.products.filter((product) => product.stock > 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/nearby"
        className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
      >
        ← Back to nearby nurseries
      </Link>

      <header className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{shop.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {[shop.addressLine, shop.city, shop.pincode].filter(Boolean).join(', ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {shop.categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {category}
                </span>
              ))}
            </div>
          </div>

          <div className="text-right text-sm">
            {shop.distanceKm !== null && (
              <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                {distanceLabel(shop.distanceKm)} away
              </p>
            )}
            <p className="text-zinc-500">
              {shop.ratingCount > 0
                ? `★ ${shop.ratingAvg.toFixed(1)} · ${shop.ratingCount} reviews`
                : 'No reviews yet'}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Delivers within {shop.deliveryRadiusKm} km ·{' '}
              {Number(shop.deliveryFee) === 0 ? 'free delivery' : `${rupees(shop.deliveryFee)} fee`}
            </p>
            {shop.deliversToYou !== null && (
              <p
                className={`mt-1 text-xs font-medium ${
                  shop.deliversToYou ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {shop.deliversToYou
                  ? '✓ Delivers to your location'
                  : 'Outside their delivery range'}
              </p>
            )}
          </div>
        </div>

        {shop.description && (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{shop.description}</p>
        )}
      </header>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wider text-zinc-400 uppercase">
        {inStock.length} plants available
      </h2>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {inStock.map((product) => (
          <li
            key={product.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3 className="font-medium">{product.title}</h3>
            <p className="text-xs text-zinc-500 italic">{product.plant.scientificName}</p>
            {product.ratingCount > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                <Stars value={product.ratingAvg} />
                {product.ratingAvg.toFixed(1)} ({product.ratingCount})
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-lg font-semibold">{rupees(product.price)}</span>
              <span className="text-xs text-zinc-500">
                {product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'}
              </span>
            </div>
            <div className="mt-3">
              <AddToCartButton productId={product.id} />
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-wider text-zinc-400 uppercase">
        What buyers say
      </h2>
      {reviews ? (
        <ReviewList data={reviews} />
      ) : (
        <p className="text-sm text-zinc-500">Reviews are unavailable right now.</p>
      )}
    </main>
  );
}
