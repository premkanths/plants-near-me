import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'ADMIN') redirect('/account?denied=/admin');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Admin</h1>
      <Card>
        <p className="text-sm text-zinc-500">
          Vendor approvals, user management and analytics arrive in <strong>Step 11</strong>.
        </p>
      </Card>
    </main>
  );
}
