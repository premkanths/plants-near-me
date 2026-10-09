import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProductForm } from '@/components/vendor/ProductForm';
import { Card } from '@/components/ui';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import type { PlantSummary } from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/vendor/products/new');
  if (user.role !== 'VENDOR') redirect('/account?denied=/vendor');

  const plants = await serverApiSafe<{ items: PlantSummary[] }>('/plants?take=100');

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/vendor" className="text-sm text-zinc-500 hover:text-emerald-600">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Add a product</h1>
      <Card>
        <ProductForm plants={plants?.items ?? []} />
      </Card>
    </main>
  );
}
