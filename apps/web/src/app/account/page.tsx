import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/account');
  const { denied } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">My account</h1>

      {denied && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          You don&apos;t have access to <code>{denied}</code> with the {user.role} role.
        </div>
      )}

      <Card>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
          <dt className="text-zinc-500">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-zinc-500">Email</dt>
          <dd className="font-mono">{user.email}</dd>
          <dt className="text-zinc-500">Role</dt>
          <dd>{user.role}</dd>
          {user.phone && (
            <>
              <dt className="text-zinc-500">Phone</dt>
              <dd>{user.phone}</dd>
            </>
          )}
        </dl>
      </Card>
    </main>
  );
}
