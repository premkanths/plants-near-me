'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { AdminUserRow, Paged } from '@/lib/admin-types';

const ROLES = ['all', 'CUSTOMER', 'VENDOR', 'ADMIN'] as const;

export function UserModeration({
  data,
  currentUserId,
}: {
  data: Paged<AdminUserRow>;
  currentUserId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = params.get('role') ?? 'all';

  const setRole = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next === 'all') query.delete('role');
    else query.set('role', next);
    query.delete('page');
    router.push(`/admin/users?${query.toString()}`);
  };

  const toggle = async (user: AdminUserRow) => {
    setBusyId(user.id);
    setError(null);
    try {
      await api.patch(`/api/admin/users/${user.id}`, { isActive: !user.isActive });
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update that account');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {ROLES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setRole(option)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              option === role
                ? 'bg-emerald-600 text-white'
                : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
            }`}
          >
            {option.toLowerCase()}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      <ul className={`space-y-2 ${pending ? 'opacity-60' : ''}`}>
        {data.items.map((user) => {
          const self = user.id === currentUserId;
          return (
            <li
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {user.role.toLowerCase()}
                  </span>
                  {!user.isActive && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      Deactivated
                    </span>
                  )}
                  {self && <span className="text-xs text-zinc-400">(you)</span>}
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {user.email}
                  {user.vendor && ` · ${user.vendor.name}`} · {user.orderCount} orders ·{' '}
                  {user.reviewCount} reviews
                </p>
              </div>

              <button
                type="button"
                disabled={busyId === user.id || (self && user.isActive)}
                title={self && user.isActive ? 'You cannot deactivate your own account' : undefined}
                onClick={() => toggle(user)}
                className={`rounded-lg px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  user.isActive
                    ? 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {user.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-zinc-500">{data.total} accounts</p>
    </div>
  );
}
