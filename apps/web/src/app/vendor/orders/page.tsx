import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { OrderQueue } from '@/components/vendor/OrderQueue';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import type { VendorOrder, VendorOrderStats } from '@/lib/order-types';
import { rupees } from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs tracking-wider text-zinc-500 uppercase">{label}</div>
    </Card>
  );
}

export default async function VendorOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/vendor/orders');
  if (user.role !== 'VENDOR') redirect('/account?denied=/vendor/orders');

  const [orders, stats] = await Promise.all([
    serverApiSafe<{ items: VendorOrder[] }>('/vendor/orders'),
    serverApiSafe<VendorOrderStats>('/vendor/orders/stats'),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="mt-1 text-sm text-zinc-500">
            New orders appear here live — no need to refresh.
          </p>
        </div>
        <Link
          href="/vendor"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← Dashboard
        </Link>
      </div>

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="New" value={stats.newOrders} />
          <Stat label="In progress" value={stats.inProgress} />
          <Stat label="Delivered" value={stats.delivered} />
          <Stat label="Earned" value={rupees(stats.revenue)} />
        </div>
      )}

      <OrderQueue initial={orders?.items ?? []} />
    </main>
  );
}
