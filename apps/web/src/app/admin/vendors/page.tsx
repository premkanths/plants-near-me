import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { VendorModeration } from '@/components/admin/VendorModeration';
import type { AdminVendorRow, Paged } from '@/lib/admin-types';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin/vendors');
  if (user.role !== 'ADMIN') redirect('/account?denied=/admin');

  const { status, q } = await searchParams;
  const query = new URLSearchParams({ pageSize: '50' });
  if (status) query.set('status', status);
  if (q) query.set('q', q);

  const data = await serverApiSafe<Paged<AdminVendorRow>>(`/admin/vendors?${query.toString()}`);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <AdminNav />
      <h1 className="mb-1 text-2xl font-bold">Nurseries</h1>
      <p className="mb-6 text-sm text-zinc-500">
        A nursery stays invisible to customers until it is approved, and disappears again the moment
        it is suspended.
      </p>

      {data ? (
        <VendorModeration data={data} />
      ) : (
        <p className="text-sm text-rose-600">Could not load nurseries.</p>
      )}
    </main>
  );
}
