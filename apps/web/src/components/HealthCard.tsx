'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@/lib/api';

type State = { loading: boolean; data: HealthResponse | null; error: string | null };

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}
    />
  );
}

export function HealthCard({ initial }: { initial: HealthResponse | null }) {
  const [state, setState] = useState<State>({
    loading: initial === null,
    data: initial,
    error: initial === null ? 'API unreachable' : null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ loading: false, data: (await res.json()) as HealthResponse, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const { data, error, loading } = state;
  const apiUp = Boolean(data);
  const dbUp = data?.db.status === 'up';

  return (
    <div className="w-full max-w-xl rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">System status</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      <ul className="space-y-3 text-sm">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Dot ok={apiUp} /> NestJS API
          </span>
          <span className="font-mono text-zinc-500">
            {apiUp ? `up · ${data?.uptimeSeconds}s uptime` : (error ?? 'down')}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Dot ok={dbUp} /> PostgreSQL
          </span>
          <span className="font-mono text-zinc-500">
            {dbUp ? 'connected' : 'not connected — run `npm run db:up`'}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Dot ok={Boolean(data?.db.postgis)} /> PostGIS
          </span>
          <span className="font-mono text-zinc-500">{data?.db.postgis ?? 'unavailable'}</span>
        </li>
      </ul>

      {data && (
        <p className="mt-4 border-t border-zinc-100 pt-3 font-mono text-xs text-zinc-400 dark:border-zinc-800">
          {data.service} v{data.version} · checked {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
