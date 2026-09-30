import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function VendorDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/vendor');
  if (user.role !== 'VENDOR') redirect('/account?denied=/vendor');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-bold">Vendor dashboard</h1>
      <p className="mb-6 text-sm text-zinc-500">{user.vendor?.name ?? 'Your shop'}</p>

      {user.vendor && !user.vendor.approved && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          <strong>Pending approval.</strong> An admin needs to approve your shop before it appears
          in customer search results. You can still prepare your catalogue.
        </div>
      )}

      <Card>
        <p className="text-sm text-zinc-500">
          Products, inventory and image upload arrive in <strong>Step 4</strong>.
        </p>
      </Card>
    </main>
  );
}
