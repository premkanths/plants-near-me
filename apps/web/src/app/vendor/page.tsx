import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InventoryTable } from '@/components/vendor/InventoryTable';
import { Card } from '@/components/ui';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import {
  rupees,
  type InventoryStats,
  type ProductListResponse,
  type VendorProfile,
} from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs tracking-wider text-zinc-500 uppercase">{label}</div>
    </Card>
  );
}

export default async function VendorDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/vendor');
  if (user.role !== 'VENDOR') redirect('/account?denied=/vendor');

  const [profile, products, stats] = await Promise.all([
    serverApiSafe<VendorProfile>('/vendor/profile'),
    serverApiSafe<ProductListResponse>('/vendor/products'),
    serverApiSafe<InventoryStats>('/vendor/products/stats'),
  ]);

  if (!profile) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Card>
          <p className="text-sm text-rose-600">
            Could not load your shop. Is the API running? Try logging out and back in.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{profile.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {profile.city} · delivers within {profile.deliveryRadiusKm} km ·{' '}
            {profile.ratingCount > 0
              ? `★ ${profile.ratingAvg.toFixed(1)} (${profile.ratingCount})`
              : 'no reviews yet'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/vendor/settings"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Shop settings
          </Link>
          <Link
            href="/vendor/products/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Add product
          </Link>
        </div>
      </div>

      {!profile.approved && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          <strong>Pending approval.</strong> Your shop is hidden from customers until an admin
          approves it — you can still build your catalogue in the meantime.
        </div>
      )}
      {profile.suspended && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <strong>Suspended.</strong> Contact support — your listings are not visible to customers.
        </div>
      )}

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Products" value={String(stats.total)} />
          <Stat label="Listed" value={String(stats.active)} tone="text-emerald-600" />
          <Stat
            label="Low / out of stock"
            value={`${stats.lowStock} / ${stats.outOfStock}`}
            tone={stats.outOfStock > 0 ? 'text-rose-600' : ''}
          />
          <Stat label="Inventory value" value={rupees(stats.inventoryValue)} />
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold tracking-wider text-zinc-400 uppercase">
        Inventory
      </h2>
      <InventoryTable products={products?.items ?? []} />
    </main>
  );
}
