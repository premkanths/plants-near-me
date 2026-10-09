import Link from 'next/link';
import { ORDER_STATUS_LABEL, STATUS_TONE, type OrderSummary } from '@/lib/cart-types';
import { serverApiSafe } from '@/lib/server-api';
import { rupees } from '@/lib/vendor-types';
import { formatDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const data = await serverApiSafe<{ items: OrderSummary[]; total: number }>('/orders');
  const orders = data?.items ?? [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your orders</h1>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-sm font-medium">No orders yet</p>
          <Link
            href="/search"
            className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                    {order.orderNumber}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {formatDateTime(order.placedAt)} · {order.vendorOrders.length}{' '}
                    {order.vendorOrders.length === 1 ? 'shop' : 'shops'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[order.status] ?? 'bg-zinc-100 text-zinc-600'}`}
                  >
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                  <span className="font-semibold">{rupees(order.grandTotal)}</span>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                {order.vendorOrders.map((vendorOrder) => (
                  <li key={vendorOrder.id} className="flex justify-between">
                    <span className="truncate pr-3">
                      {vendorOrder.vendor.name} ·{' '}
                      {vendorOrder.items.map((i) => `${i.quantity}× ${i.productTitle}`).join(', ')}
                    </span>
                    <span>{ORDER_STATUS_LABEL[vendorOrder.status]}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
