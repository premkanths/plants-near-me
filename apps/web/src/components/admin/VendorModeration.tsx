'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { AdminVendorRow, Paged } from '@/lib/admin-types';

const FILTERS = ['all', 'pending', 'approved', 'suspended'] as const;

function Badge({ vendor }: { vendor: AdminVendorRow }) {
  const [text, tone] = vendor.suspended
    ? ['Suspended', 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300']
    : vendor.approved
      ? ['Live', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300']
      : ['Pending', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'];

  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;
}

export function VendorModeration({ data }: { data: Paged<AdminVendorRow> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = params.get('status') ?? 'all';

  const setFilter = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next === 'all') query.delete('status');
    else query.set('status', next);
    query.delete('page');
    router.push(`/admin/vendors?${query.toString()}`);
  };

  const patch = async (vendor: AdminVendorRow, body: Record<string, boolean>) => {
    setBusyId(vendor.id);
    setError(null);
    try {
      await api.patch(`/api/admin/vendors/${vendor.id}`, body);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update that nursery');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setFilter(filter)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              filter === status
                ? 'bg-emerald-600 text-white'
                : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No nurseries match this filter.
        </p>
      ) : (
        <ul className={`space-y-2 ${pending ? 'opacity-60' : ''}`}>
          {data.items.map((vendor) => (
            <li
              key={vendor.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{vendor.name}</span>
                  <Badge vendor={vendor} />
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {vendor.user.email} · {vendor.city} · {vendor.productCount} listings ·{' '}
                  {vendor.orderCount} orders
                  {vendor.ratingCount > 0 && ` · ★ ${vendor.ratingAvg.toFixed(1)}`}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === vendor.id}
                  onClick={() => patch(vendor, { approved: !vendor.approved })}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {vendor.approved ? 'Revoke approval' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busyId === vendor.id}
                  onClick={() => patch(vendor, { suspended: !vendor.suspended })}
                  className={`rounded-lg px-3 py-1.5 text-sm text-white transition disabled:opacity-50 ${
                    vendor.suspended
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {vendor.suspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-zinc-500">
        {data.total} nurser{data.total === 1 ? 'y' : 'ies'}
      </p>
    </div>
  );
}
