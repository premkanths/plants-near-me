'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { connectionLabel, useRealtime } from '@/hooks/useRealtime';
import { ORDER_STATUS_LABEL } from '@/lib/cart-types';
import type { DeliveryPositionEvent, OrderStatusEvent } from '@/lib/realtime';

export interface TrackedSlice {
  id: string;
  orderNumber: string;
  vendorName: string;
  status: string;
  rejectionReason?: string | null;
}

const STEPS = [
  'ORDERED',
  'ACCEPTED',
  'PACKING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const stepIndex = (status: string) => STEPS.indexOf(status);

/**
 * Live tracker for one order.
 *
 * Server-rendered statuses are the starting point; the socket only pushes
 * deltas on top. If the connection never comes up the customer still sees a
 * correct (if static) order — the timeline degrades to what the page shipped.
 */
export function OrderTracker({
  masterOrderId,
  initial,
}: {
  masterOrderId: string;
  initial: TrackedSlice[];
}) {
  const router = useRouter();
  const [slices, setSlices] = useState<TrackedSlice[]>(initial);
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryPositionEvent>>({});

  const connection = useRealtime({
    watchOrder: masterOrderId,
    handlers: {
      'order.status': (event: OrderStatusEvent) => {
        setSlices((current) =>
          current.map((slice) =>
            slice.id === event.vendorOrderId
              ? { ...slice, status: event.status, rejectionReason: event.rejectionReason }
              : slice,
          ),
        );
        if (event.status === 'DELIVERED' || event.status === 'REJECTED') {
          setDeliveries((current) => {
            const next = { ...current };
            delete next[event.vendorOrderId];
            return next;
          });
        }
        // Pull the authoritative copy (totals, master status) from the server.
        router.refresh();
      },
      'delivery.position': (event: DeliveryPositionEvent) => {
        setDeliveries((current) => ({ ...current, [event.vendorOrderId]: event }));
      },
    },
  });

  const badge = connectionLabel(connection);

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Order tracking</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}>
          {connection === 'live' && '● '}
          {badge.text}
        </span>
      </header>

      <div className="space-y-6">
        {slices.map((slice) => {
          const rejected = slice.status === 'REJECTED';
          const reached = stepIndex(slice.status);
          const ride = deliveries[slice.id];

          return (
            <div key={slice.id}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">🏪 {slice.vendorName}</p>
                <p
                  className={`text-xs ${rejected ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}
                >
                  {ORDER_STATUS_LABEL[slice.status] ?? slice.status}
                </p>
              </div>

              {rejected ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  This shop could not fulfil its part
                  {slice.rejectionReason ? `: ${slice.rejectionReason}` : '.'} You have not been
                  charged for it.
                </p>
              ) : (
                <ol className="flex items-center gap-1">
                  {STEPS.map((step, index) => {
                    const done = index <= reached;
                    return (
                      <li key={step} className="flex-1">
                        <div
                          className={`h-1.5 rounded-full transition-colors ${
                            done ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                          }`}
                          title={ORDER_STATUS_LABEL[step]}
                        />
                        <p
                          className={`mt-1 hidden text-[10px] sm:block ${
                            done ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400'
                          }`}
                        >
                          {ORDER_STATUS_LABEL[step]}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}

              {ride && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  🛵 On the way — {Math.round(ride.progress * 100)}% there
                  {ride.etaSeconds > 0 && `, about ${ride.etaSeconds}s away`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
