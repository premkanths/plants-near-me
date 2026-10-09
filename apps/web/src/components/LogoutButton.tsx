'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch('/api/session', { method: 'DELETE' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {loading ? 'Logging out…' : 'Log out'}
    </button>
  );
}
