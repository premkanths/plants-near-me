import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ShopDetail } from '@/lib/discovery-types';
import type { ShopReviews } from '@/lib/review-types';
import { serverApiSafe } from '@/lib/server-api';
import { NurseryStorefront } from '@/components/store/NurseryStorefront';

import { FALLBACK_SHOPS } from '@/lib/fallback-shops';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop =
    (await serverApiSafe<ShopDetail>(`/shops/${encodeURIComponent(slug)}`, {
      isPublic: true,
      revalidate: 60,
    })) ?? FALLBACK_SHOPS[slug];

  if (!shop) return { title: 'Nursery · E-PlantShopping' };

  return {
    title: `${shop.name} · Local Nursery & Plants · E-PlantShopping`,
    description: shop.description || `Browse plants, pots, and order direct delivery from ${shop.name} in Bengaluru.`,
  };
}

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
  let shop = await serverApiSafe<ShopDetail>(`/shops/${encodeURIComponent(slug)}${point}`, {
    isPublic: true,
    revalidate: 60,
  });

  if (!shop) {
    shop = FALLBACK_SHOPS[slug] ?? null;
  }

  if (!shop) notFound();

  const reviews = await serverApiSafe<ShopReviews>(
    `/reviews/shop/${encodeURIComponent(slug)}?pageSize=10`,
    { isPublic: true, revalidate: 60 },
  );

  return (
    <main className="min-h-screen bg-[#fafcf9] dark:bg-[#090e0b]">
      <NurseryStorefront shop={shop} reviews={reviews} />
    </main>
  );
}
