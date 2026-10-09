import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminCharts } from '@/components/admin/AdminCharts';
import { AdminNav } from '@/components/admin/AdminNav';
import { ExportButtons } from '@/components/admin/ExportButtons';
import { StatCard } from '@/components/admin/StatCard';
import type { AdminAnalytics, AdminOverview } from '@/lib/admin-types';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import { rupees } from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'ADMIN') redirect('/account?denied=/admin');

  const { days } = await searchParams;
  const range = RANGES.includes(Number(days)) ? Number(days) : 30;

  const [overview, analytics] = await Promise.all([
    serverApiSafe<AdminOverview>('/admin/overview'),
    serverApiSafe<AdminAnalytics>(`/admin/analytics?days=${range}`),
  ]);

  if (!overview) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <AdminNav />
        <p className="text-sm text-rose-600">Could not load admin data. Is the API running?</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <AdminNav />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Marketplace overview</h1>
        <div className="flex gap-1">
          {RANGES.map((option) => (
            <Link
              key={option}
              href={`/admin?days=${option}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                option === range
                  ? 'bg-emerald-600 text-white'
                  : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
              }`}
            >
              {option}d
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue (paid)"
          value={rupees(overview.revenue)}
          hint="Excludes abandoned checkouts"
        />
        <StatCard
          label="Orders"
          value={overview.orders.total}
          hint={`${overview.orders.byStatus.COMPLETED ?? 0} completed`}
        />
        <StatCard
          label="Nurseries"
          value={overview.vendors.approved}
          hint={`${overview.vendors.total} registered`}
        />
        <StatCard
          label="Awaiting approval"
          value={overview.vendors.pending}
          hint={`${overview.vendors.suspended} suspended`}
          tone="warn"
        />
        <StatCard label="Customers" value={overview.users.customers} />
        <StatCard label="Active listings" value={overview.catalogue.activeProducts} />
        <StatCard label="Reviews" value={overview.reviews} />
        <StatCard
          label="Users"
          value={overview.users.total}
          hint={`${overview.users.admins} admins`}
        />
      </div>

      <div className="my-6">
        <ExportButtons />
      </div>

      {analytics ? (
        <AdminCharts analytics={analytics} />
      ) : (
        <p className="text-sm text-zinc-500">Charts are unavailable right now.</p>
      )}
    </main>
  );
}
