'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { distanceLabel, type ShopDetail } from '@/lib/discovery-types';
import { ReviewList } from '@/components/reviews/ReviewList';
import { Stars } from '@/components/reviews/Stars';
import type { ShopReviews } from '@/lib/review-types';
import { rupees } from '@/lib/vendor-types';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { getPlantImage, getNurseryBranding } from '@/lib/plant-images';
import { PlantQuickViewModal, type PlantQuickViewItem } from '@/components/PlantQuickViewModal';
import { useWishlist } from '@/lib/wishlist-store';

interface Props {
  shop: ShopDetail;
  reviews: ShopReviews | null;
}

type FilterCategory = 'all' | 'indoor' | 'outdoor' | 'petSafe' | 'easy' | 'under500';
type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

export function NurseryStorefront({ shop, reviews }: Props) {
  const branding = getNurseryBranding(shop.slug);
  const { toggleWishlist, isWishlisted } = useWishlist();

  const [activeTab, setActiveTab] = useState<'inventory' | 'reviews' | 'about'>('inventory');
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [quickViewItem, setQuickViewItem] = useState<PlantQuickViewItem | null>(null);

  const inStockProducts = useMemo(() => {
    return shop.products.filter((p) => p.stock > 0);
  }, [shop.products]);

  // Filtered & sorted products within this nursery
  const filteredProducts = useMemo(() => {
    let list = [...inStockProducts];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.plant.commonName?.toLowerCase().includes(q) ||
          p.plant.scientificName?.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (filter === 'under500') {
      list = list.filter((p) => parseFloat(p.price) <= 500);
    }

    // Sort
    if (sortOption === 'price-asc') {
      list.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    } else if (sortOption === 'price-desc') {
      list.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    } else if (sortOption === 'rating') {
      list.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
    }

    return list;
  }, [inStockProducts, searchQuery, filter, sortOption]);

  const deliveryFeeNum = Number(shop.deliveryFee);

  return (
    <div className="w-full pb-16">
      {/* ── Breadcrumb & Back ───────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/" className="hover:text-emerald-700 transition">Home</Link>
          <span>/</span>
          <Link href="/nearby" className="hover:text-emerald-700 transition">Nurseries</Link>
          <span>/</span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{shop.name}</span>
        </div>
      </div>

      {/* ── Storefront Hero Banner ──────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-zinc-900 shadow-xl dark:border-emerald-500/20">
          {/* Banner Photo with Gradient Scrim */}
          <div className="relative h-56 w-full sm:h-72">
            <img
              src={branding.coverImage}
              alt={shop.name}
              className="h-full w-full object-cover brightness-[0.78] transition duration-500 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

            {/* Badges Overlay */}
            <div className="absolute top-4 left-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-600/90 px-3 py-1 text-xs font-bold text-white shadow-md backdrop-blur">
                {branding.badge}
              </span>
              <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
                {branding.founded}
              </span>
            </div>

            {/* Distance / Delivery Status Overlay */}
            <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
              {shop.distanceKm !== null && (
                <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-emerald-800 shadow-md backdrop-blur dark:bg-zinc-900/90 dark:text-emerald-400">
                  📍 {distanceLabel(shop.distanceKm)} away
                </span>
              )}
              {shop.deliversToYou !== null && (
                <span
                  className={`rounded-full px-3 py-0.5 text-[11px] font-semibold backdrop-blur shadow-xs ${
                    shop.deliversToYou
                      ? 'bg-emerald-500 text-white'
                      : 'bg-amber-500/90 text-white'
                  }`}
                >
                  {shop.deliversToYou ? '✓ Delivers to your address' : 'Pickup only'}
                </span>
              )}
            </div>
          </div>

          {/* Store Info Row */}
          <div className="relative z-10 -mt-14 bg-white/95 p-6 backdrop-blur-md dark:bg-zinc-900/95 sm:-mt-16 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              {/* Avatar + Main Details */}
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white shadow-xl dark:border-zinc-800 sm:h-24 sm:w-24">
                  <img
                    src={branding.avatarImage}
                    alt={shop.name}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                    ✓
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                      {shop.name}
                    </h1>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Verified Nursery
                    </span>
                  </div>

                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:text-sm">
                    {branding.tagline}
                  </p>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {[shop.addressLine, shop.city, shop.pincode].filter(Boolean).join(', ')}
                  </p>

                  {/* Rating & Categories */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      <span>★</span>
                      <span>{shop.ratingAvg > 0 ? shop.ratingAvg.toFixed(1) : 'New'}</span>
                      <span className="font-normal text-amber-600 dark:text-amber-400">
                        ({shop.ratingCount} reviews)
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {shop.categories.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Delivery Specs & Quick Contact */}
              <div className="flex flex-col items-start gap-3 border-t border-zinc-200/80 pt-4 sm:items-end sm:border-t-0 sm:pt-0 dark:border-zinc-800">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-left text-xs sm:text-right dark:border-emerald-900/30 dark:bg-emerald-950/20">
                  <div className="font-bold text-emerald-900 dark:text-emerald-300">
                    {deliveryFeeNum === 0 ? '🎉 Free Local Delivery' : `₹${deliveryFeeNum} Local Delivery`}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Within {shop.deliveryRadiusKm} km radius · Same-day courier
                  </div>
                </div>

                {shop.phone && (
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${shop.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
                    >
                      📞 Call Grower
                    </a>
                    <a
                      href={`https://wa.me/${shop.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Highlights Ribbon */}
            <div className="mt-6 grid grid-cols-1 gap-3 border-t border-zinc-100 pt-5 text-xs sm:grid-cols-3 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <span className="text-base">🪴</span>
                <div>
                  <div className="font-bold text-zinc-800 dark:text-zinc-200">Specialty</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{branding.specialty}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-base">🌱</span>
                <div>
                  <div className="font-bold text-zinc-800 dark:text-zinc-200">Signature Soil Mix</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{branding.soilMix}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-base">✨</span>
                <div>
                  <div className="font-bold text-zinc-800 dark:text-zinc-200">Marketplace Guarantee</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">7-Day Healthy Root Replacement</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === 'inventory'
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>🌿 Plant Catalogue</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {inStockProducts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === 'reviews'
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>⭐ Customer Reviews</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {shop.ratingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === 'about'
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>🏡 Nursery Profile & Location</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: Inventory Explorer ───────────────────────── */}
      {activeTab === 'inventory' && (
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          {/* Search & Sort Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search plants in this nursery (e.g. Monstera, Snake Plant)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-900 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-zinc-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-3 py-1.5 font-bold transition ${
                  filter === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('under500')}
                className={`rounded-lg px-3 py-1.5 font-bold transition ${
                  filter === 'under500'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                💰 Under ₹500
              </button>

              {/* Sort Selector */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                aria-label="Sort plants"
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <option value="featured">Sort: Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="rating">Top Rated</option>
              </select>
            </div>
          </div>

          {/* Plant Grid */}
          {filteredProducts.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
              <span className="text-4xl">🪴</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                No matching plants found in this nursery
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Try clearing your search query or adjusting your filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                }}
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const plantImg = getPlantImage(
                  product.plant.slug || product.plant.commonName || product.title,
                  product.images?.[0]
                );
                const wishlisted = isWishlisted(product.id);

                return (
                  <div
                    key={product.id}
                    className="group relative flex flex-col rounded-3xl border border-zinc-200/90 bg-white p-4 shadow-xs transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
                  >
                    {/* Wishlist Button */}
                    <button
                      onClick={() => toggleWishlist(product.id)}
                      className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110 dark:bg-zinc-800/90"
                      title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                      <span className="text-sm">{wishlisted ? '❤️' : '🤍'}</span>
                    </button>

                    {/* Plant Photography */}
                    <div
                      onClick={() =>
                        setQuickViewItem({
                          id: product.id,
                          title: product.title,
                          price: product.price,
                          stock: product.stock,
                          image: plantImg,
                          plant: {
                            commonName: product.plant.commonName,
                            scientificName: product.plant.scientificName,
                          },
                          vendor: {
                            id: shop.id,
                            name: shop.name,
                            slug: shop.slug,
                          },
                          distanceKm: shop.distanceKm,
                          ratingAvg: product.ratingAvg,
                          ratingCount: product.ratingCount,
                        })
                      }
                      className="relative mb-3 flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20"
                    >
                      <img
                        src={plantImg}
                        alt={product.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />

                      {/* Stock Badge */}
                      <div className="absolute bottom-2.5 left-2.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-xs backdrop-blur ${
                            product.stock <= 4
                              ? 'bg-amber-500 text-white'
                              : 'bg-white/90 text-emerald-800 dark:bg-zinc-900/90 dark:text-emerald-300'
                          }`}
                        >
                          {product.stock <= 4 ? `⚡ Only ${product.stock} left` : '✓ In Stock'}
                        </span>
                      </div>

                      {/* Quick View Hover Tag */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover:opacity-100">
                        <span className="rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-zinc-900 shadow-md dark:bg-zinc-900 dark:text-zinc-50">
                          👁️ Quick View
                        </span>
                      </div>
                    </div>

                    {/* Plant Info */}
                    <h3
                      onClick={() =>
                        setQuickViewItem({
                          id: product.id,
                          title: product.title,
                          price: product.price,
                          stock: product.stock,
                          image: plantImg,
                          plant: {
                            commonName: product.plant.commonName,
                            scientificName: product.plant.scientificName,
                          },
                          vendor: {
                            id: shop.id,
                            name: shop.name,
                            slug: shop.slug,
                          },
                          distanceKm: shop.distanceKm,
                          ratingAvg: product.ratingAvg,
                          ratingCount: product.ratingCount,
                        })
                      }
                      className="cursor-pointer text-sm font-bold text-zinc-900 hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-400"
                    >
                      {product.title}
                    </h3>
                    <p className="text-xs text-zinc-500 italic mt-0.5">{product.plant.scientificName}</p>

                    {product.ratingCount > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <Stars value={product.ratingAvg} />
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {product.ratingAvg.toFixed(1)}
                        </span>
                        <span>({product.ratingCount})</span>
                      </p>
                    )}

                    {/* Price and Cart */}
                    <div className="mt-auto pt-4">
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                          {rupees(product.price)}
                        </span>
                        {product.potSize && (
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            🪴 {product.potSize}
                          </span>
                        )}
                      </div>

                      <AddToCartButton
                        productId={product.id}
                        title={product.title}
                        price={product.price}
                        vendorName={shop.name}
                        stock={product.stock}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Customer Reviews ─────────────────────────── */}
      {activeTab === 'reviews' && (
        <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
          <div className="mb-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              Verified Buyer Feedback for {shop.name}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Reviews are verified and submitted by customers who placed and received an order from this nursery.
            </p>
          </div>

          {reviews ? (
            <ReviewList data={reviews} />
          ) : (
            <p className="text-center text-sm text-zinc-500 py-12">
              Reviews are currently unavailable for this nursery.
            </p>
          )}
        </div>
      )}

      {/* ── TAB 3: About & Location ─────────────────────────── */}
      {activeTab === 'about' && (
        <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 space-y-6">
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">About {shop.name}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-sm">
              {shop.description || branding.tagline}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">📍 Nursery Location</h4>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {[shop.addressLine, shop.city, shop.state, shop.pincode].filter(Boolean).join(', ')}
                </p>
                <div className="mt-3">
                  <Link
                    href={`/nearby?lat=${shop.latitude}&lng=${shop.longitude}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    🗺️ View on Interactive Map →
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">🚚 Delivery Radius</h4>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Delivers within {shop.deliveryRadiusKm} km of the nursery.
                  <br />
                  Delivery Fee: {deliveryFeeNum === 0 ? 'Free' : `₹${deliveryFeeNum}`}
                </p>
                {shop.phone && (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    Direct Contact: <a href={`tel:${shop.phone}`} className="font-semibold text-emerald-700">{shop.phone}</a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick View Modal */}
      <PlantQuickViewModal
        item={quickViewItem}
        onClose={() => setQuickViewItem(null)}
      />
    </div>
  );
}
