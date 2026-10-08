'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { connectionLabel, useRealtime } from '@/hooks/useRealtime';
import { api, ApiError } from '@/lib/api-client';
import { ORDER_STATUS_LABEL, STATUS_TONE } from '@/lib/cart-types';
import { ACTION_LABEL, type VendorOrder, type VendorOrderStatus } from '@/lib/order-types';
import type { OrderStatusEvent } from '@/lib/realtime';
import { rupees } from '@/lib/vendor-types';
import { formatDateTime } from '@/lib/datetime';

/**
 * The shop's live order queue.
 *
 * Buttons are rendered from `allowedNext`, which the API derives from the same
 * state machine it enforces — so the UI can never offer a move the server will
 * refuse. A rejection asks for a reason because the customer is shown it.
 */
export function OrderQueue({ initial }: { initial: VendorOrder[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState(0);

  const connection = useRealtime({
    handlers: {
      'order.created': () => {
        setIncoming((count) => count + 1);
        router.refresh();
      },
      'order.status': (event: OrderStatusEvent) => {
        setOrders((current) =>
          current.map((order) =>
            order.id === event.vendorOrderId
              ? { ...order, status: event.status as VendorOrderStatus }
              : order,
          ),
        );
        router.refresh();
      },
    },
  });

  const badge = connectionLabel(connection);

  const advance = async (order: VendorOrder, status: VendorOrderStatus) => {
    let reason: string | undefined;
    if (status === 'REJECTED') {
      reason = window.prompt('Why are you rejecting this order? The customer will see this.') ?? '';
      if (!reason.trim()) return;
    }

    setBusy(order.id);
    setError(null);
    try {
      const updated = await api.patch<VendorOrder>(
        `/api/vendor/orders/${order.id}/status`,
        reason ? { status, reason } : { status },
      );
      setOrders((current) =>
        current.map((row) => (row.id === order.id ? { ...row, ...updated } : row)),
      );
      router.refresh();
    } catch (caught) {
      // A 400 here means the order moved underneath us (another tab, or the
      // delivery simulator finishing) — reloading shows the truth.
      setError(caught instanceof ApiError ? caught.message : 'Could not update the order');
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (orders.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No orders yet. They will appear here the moment a customer checks out.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}>
          {connection === 'live' && '● '}
          {badge.text}
        </span>
        {incoming > 0 && (
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
            🔔 {incoming} new order{incoming > 1 ? 's' : ''} just came in
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {orders.map((order) => (
        <article
          key={order.id}
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-xs text-zinc-500">
                {formatDateTime(order.createdAt)} · {order.masterOrder.recipientName} ·{' '}
                {order.masterOrder.recipientPhone}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[order.status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}
            >
              {ORDER_STATUS_LABEL[order.status]}
            </span>
          </header>

          <ul className="divide-y divide-zinc-100 px-4 dark:divide-zinc-800">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between py-2 text-sm">
                <span>
                  {item.quantity} × {item.productTitle}
                </span>
                <span className="tabular-nums">{rupees(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <div className="px-4 py-2 text-xs text-zinc-500">
            📍{' '}
            {[
              order.masterOrder.addressLine1,
              order.masterOrder.addressLine2,
              order.masterOrder.city,
              order.masterOrder.pincode,
            ]
              .filter(Boolean)
              .join(', ')}
            {order.masterOrder.notes && <span className="block">“{order.masterOrder.notes}”</span>}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <span className="text-sm font-semibold tabular-nums">{rupees(order.total)}</span>

            <div className="flex flex-wrap gap-2">
              {order.allowedNext.length === 0 && (
                <span className="text-xs text-zinc-400">
                  {order.status === 'REJECTED'
                    ? `Rejected: ${order.rejectionReason ?? '—'}`
                    : 'Finished'}
                </span>
              )}
              {order.allowedNext.map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={busy === order.id}
                  onClick={() => void advance(order, next)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    next === 'REJECTED'
                      ? 'border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {ACTION_LABEL[next]}
                </button>
              ))}
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}
