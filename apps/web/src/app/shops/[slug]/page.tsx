import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ShopDetail } from '@/lib/discovery-types';
import type { ShopReviews } from '@/lib/review-types';
import { serverApiSafe } from '@/lib/server-api';
import { NurseryStorefront } from '@/components/store/NurseryStorefront';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await serverApiSafe<ShopDetail>(`/shops/${encodeURIComponent(slug)}`);
  if (!shop) return { title: 'Nursery Not Found · E-PlantShopping' };

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
  const shop = await serverApiSafe<ShopDetail>(`/shops/${encodeURIComponent(slug)}${point}`);
  if (!shop) notFound();

  const reviews = await serverApiSafe<ShopReviews>(
    `/reviews/shop/${encodeURIComponent(slug)}?pageSize=10`,
  );

  return (
    <main className="min-h-screen bg-[#fafcf9] dark:bg-[#090e0b]">
      <NurseryStorefront shop={shop} reviews={reviews} />
    </main>
  );
}
