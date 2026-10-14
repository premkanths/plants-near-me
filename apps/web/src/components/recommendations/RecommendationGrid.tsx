'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { Stars } from '@/components/reviews/Stars';
import type { Recommendation } from '@/lib/recommendation-types';
import { rupees } from '@/lib/vendor-types';
import { PlantQuickViewModal, type PlantQuickViewItem } from '@/components/PlantQuickViewModal';
import { useWishlist } from '@/lib/wishlist-store';
import { getPlantImage } from '@/lib/plant-images';

/** A card grid of picks, each carrying the reason it was chosen + quick view & wishlist support. */
export function RecommendationGrid({ items }: { items: Recommendation[] }) {
  const [quickViewItem, setQuickViewItem] = useState<PlantQuickViewItem | null>(null);
  const { toggleWishlist, isWishlisted } = useWishlist();

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Nothing to suggest yet — add a few plants to the catalogue first.
      </p>
    );
  }

  return (
    <>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const wishlisted = isWishlisted(item.productId);
          const plantPhoto = getPlantImage(item.plant.name || item.title, item.imageUrl);

          return (
            <li
              key={item.productId}
              className="group relative flex flex-col rounded-3xl border border-zinc-200/90 bg-white p-4 shadow-xs transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
            >
              {/* Wishlist Toggle Button */}
              <button
                onClick={() => toggleWishlist(item.productId)}
                className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110 dark:bg-zinc-800/90"
                title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <span className="text-sm">{wishlisted ? '❤️' : '🤍'}</span>
              </button>

              {/* Plant Image / Photography */}
              <div 
                onClick={() => setQuickViewItem({
                  id: item.productId,
                  title: item.title,
                  price: item.price,
                  stock: item.stock,
                  image: plantPhoto,
                  plant: {
                    commonName: item.plant.name,
                    scientificName: item.plant.scientificName,
                  },
                  vendor: {
                    id: item.vendor.id,
                    name: item.vendor.name,
                    slug: item.vendor.slug,
                  },
                  distanceKm: item.distanceKm,
                  ratingAvg: item.ratingAvg,
                  ratingCount: item.ratingCount,
                })}
                className="relative mb-3 flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-emerald-50/60 transition group-hover:bg-emerald-100/50 dark:bg-emerald-950/20"
              >
                <img
                  src={plantPhoto}
                  alt={item.title}
                  className="h-full w-full object-cover transition transform duration-500 group-hover:scale-105"
                />

                {/* Stock Indicator */}
                <div className="absolute bottom-2.5 left-2.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-xs backdrop-blur ${
                      item.stock <= 4
                        ? 'bg-amber-500 text-white'
                        : 'bg-white/90 text-emerald-800 dark:bg-zinc-900/90 dark:text-emerald-300'
                    }`}
                  >
                    {item.stock <= 4 ? `⚡ Only ${item.stock} left` : '✓ In Stock'}
                  </span>
                </div>

                {/* Quick View Hover Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover:opacity-100">
                  <span className="rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-zinc-800 shadow-md dark:bg-zinc-900 dark:text-zinc-100">
                    👁️ Quick View
                  </span>
                </div>
              </div>

              {/* Plant info */}
              <h3 
                onClick={() => setQuickViewItem({
                  id: item.productId,
                  title: item.title,
                  price: item.price,
                  stock: item.stock,
                  image: plantPhoto,
                  plant: {
                    commonName: item.plant.name,
                    scientificName: item.plant.scientificName,
                  },
                  vendor: {
                    id: item.vendor.id,
                    name: item.vendor.name,
                    slug: item.vendor.slug,
                  },
                  distanceKm: item.distanceKm,
                  ratingAvg: item.ratingAvg,
                  ratingCount: item.ratingCount,
                })}
                className="cursor-pointer text-sm font-bold text-zinc-900 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400"
              >
                {item.title}
              </h3>
              <p className="text-xs text-zinc-500 italic mt-0.5">{item.plant.scientificName}</p>

              <Link
                href={`/shops/${item.vendor.slug}`}
                className="mt-1 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400 flex items-center gap-1"
              >
                <span>🏪</span>
                <span>{item.vendor.name}</span>
                {item.distanceKm !== null && (
                  <span className="text-[11px] font-normal text-zinc-500">
                    · {item.distanceKm.toFixed(1)} km
                  </span>
                )}
              </Link>

              {item.ratingCount > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <Stars value={item.ratingAvg} />
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {item.ratingAvg.toFixed(1)}
                  </span>
                  <span>({item.ratingCount})</span>
                </p>
              )}

              {/* Recommendation reasons or blurb */}
              {item.blurb ? (
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                  {item.blurb}
                </p>
              ) : (
                <ul className="mt-2 space-y-0.5">
                  {item.reasons.slice(0, 2).map((reason) => (
                    <li key={reason} className="text-xs text-zinc-500 truncate">
                      ✓ {reason}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
                    {rupees(item.price)}
                  </span>
                </div>
                <AddToCartButton 
                  productId={item.productId}
                  title={item.title}
                  price={item.price}
                  vendorName={item.vendor.name}
                  stock={item.stock}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Quick View Modal */}
      <PlantQuickViewModal
        item={quickViewItem}
        onClose={() => setQuickViewItem(null)}
      />
    </>
  );
}
