import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShopSettingsForm } from '@/components/vendor/ShopSettingsForm';
import { Card } from '@/components/ui';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import type { VendorProfile } from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

export default async function ShopSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/vendor/settings');
  if (user.role !== 'VENDOR') redirect('/account?denied=/vendor');

  const profile = await serverApiSafe<VendorProfile>('/vendor/profile');
  if (!profile) redirect('/vendor');

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/vendor" className="text-sm text-zinc-500 hover:text-emerald-600">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Shop settings</h1>
      <Card>
        <ShopSettingsForm profile={profile} />
      </Card>
    </main>
  );
}
