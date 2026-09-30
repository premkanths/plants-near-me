import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ProductForm } from '@/components/vendor/ProductForm';
import { Card } from '@/components/ui';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import type { PlantSummary, VendorProduct } from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/vendor');
  if (user.role !== 'VENDOR') redirect('/account?denied=/vendor');

  const { id } = await params;
  const [product, plants] = await Promise.all([
    serverApiSafe<VendorProduct>(`/vendor/products/${id}`),
    serverApiSafe<{ items: PlantSummary[] }>('/plants?take=100'),
  ]);

  // Also covers another vendor's product: the API answers 403, so we render 404.
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/vendor" className="text-sm text-zinc-500 hover:text-emerald-600">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Edit product</h1>
      <Card>
        <ProductForm plants={plants?.items ?? []} product={product} />
      </Card>
    </main>
  );
}
