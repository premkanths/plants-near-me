import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { UserModeration } from '@/components/admin/UserModeration';
import type { AdminUserRow, Paged } from '@/lib/admin-types';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin/users');
  if (user.role !== 'ADMIN') redirect('/account?denied=/admin');

  const { role, q } = await searchParams;
  const query = new URLSearchParams({ pageSize: '50' });
  if (role) query.set('role', role);
  if (q) query.set('q', q);

  const data = await serverApiSafe<Paged<AdminUserRow>>(`/admin/users?${query.toString()}`);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <AdminNav />
      <h1 className="mb-1 text-2xl font-bold">Users</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Deactivating an account blocks login immediately and drops its refresh token.
      </p>

      {data ? (
        <UserModeration data={data} currentUserId={user.id} />
      ) : (
        <p className="text-sm text-rose-600">Could not load users.</p>
      )}
    </main>
  );
}
