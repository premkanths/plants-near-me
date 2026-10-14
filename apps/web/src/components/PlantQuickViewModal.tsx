'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { rupees } from '@/lib/vendor-types';

export interface PlantQuickViewItem {
  id: string; // product ID
  title: string;
  price: string;
  stock: number;
  image?: string | null;
  description?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  plant?: {
    id?: string;
    commonName?: string;
    scientificName?: string;
    sunlight?: string;
    water?: string;
    difficulty?: string;
    placement?: string;
    petFriendly?: boolean;
    airPurifying?: boolean;
    flowering?: boolean;
  };
  vendor?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  distanceKm?: number | null;
}

interface Props {
  item: PlantQuickViewItem | null;
  onClose: () => void;
}

export function PlantQuickViewModal({ item, onClose }: Props) {
  const [quantity, setQuantity] = useState(1);

  if (!item) return null;

  const plantName = item.plant?.commonName || item.title;
  const scientificName = item.plant?.scientificName;
  const vendorName = item.vendor?.name || 'Local Nursery';
  const vendorSlug = item.vendor?.slug;
  const priceNum = parseFloat(item.price) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 dark:border dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 transition"
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
          {/* Image Column */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-emerald-50/50 p-6 dark:bg-emerald-950/20">
            {item.image ? (
              <img
                src={item.image}
                alt={plantName}
                className="max-h-72 w-full object-contain transition transform hover:scale-105"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-emerald-600/70 dark:text-emerald-400/70">
                <span className="text-6xl mb-2">🌿</span>
                <span className="text-xs font-medium uppercase tracking-wider">Botanical Specimen</span>
              </div>
            )}

            {/* Distance / Pet-friendly badge overlay */}
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              {item.plant?.petFriendly && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  🐾 Pet Safe
                </span>
              )}
              {item.plant?.airPurifying && (
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  🍃 Air Purifier
                </span>
              )}
            </div>
          </div>

          {/* Details Column */}
          <div className="flex flex-col justify-between space-y-4">
            <div>
              {/* Vendor & Rating */}
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                {vendorSlug ? (
                  <Link
                    href={`/shops/${vendorSlug}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400 flex items-center gap-1"
                  >
                    📍 {vendorName}
                    {item.distanceKm != null && (
                      <span className="text-zinc-400">({item.distanceKm.toFixed(1)} km)</span>
                    )}
                  </Link>
                ) : (
                  <span>📍 {vendorName}</span>
                )}

                {item.ratingAvg != null && item.ratingAvg > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    ⭐ {item.ratingAvg.toFixed(1)} ({item.ratingCount || 1})
                  </span>
                )}
              </div>

              {/* Title & Scientific name */}
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {plantName}
              </h2>
              {scientificName && (
                <p className="text-xs italic text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {scientificName}
                </p>
              )}

              {/* Price */}
              <div className="mt-3 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {rupees(priceNum)}
              </div>

              {/* Description */}
              {item.description && (
                <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 line-clamp-3">
                  {item.description}
                </p>
              )}

              {/* Quick Care Traits Grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {item.plant?.sunlight && (
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <span className="block font-medium text-zinc-400 text-[10px] uppercase">Sunlight</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      ☀️ {item.plant.sunlight.replace('_', ' ')}
                    </span>
                  </div>
                )}
                {item.plant?.water && (
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <span className="block font-medium text-zinc-400 text-[10px] uppercase">Water</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      💧 {item.plant.water} Need
                    </span>
                  </div>
                )}
                {item.plant?.difficulty && (
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <span className="block font-medium text-zinc-400 text-[10px] uppercase">Care Level</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      ⚡ {item.plant.difficulty}
                    </span>
                  </div>
                )}
                {item.plant?.placement && (
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <span className="block font-medium text-zinc-400 text-[10px] uppercase">Placement</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      🏠 {item.plant.placement}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Add to Cart Actions */}
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white font-semibold"
                  >
                    -
                  </button>
                  <span className="px-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(item.stock || 10, q + 1))}
                    className="px-3 py-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white font-semibold"
                  >
                    +
                  </button>
                </div>

                <div className="flex-1">
                  <AddToCartButton
                    productId={item.id}
                    title={item.title}
                    price={item.price}
                    vendorName={vendorName}
                    stock={item.stock}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
