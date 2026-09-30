import Link from 'next/link';
import { OrderTracker } from '@/components/orders/OrderTracker';
import { notFound } from 'next/navigation';
import { ORDER_STATUS_LABEL, STATUS_TONE, type Order } from '@/lib/cart-types';
import { serverApiSafe } from '@/lib/server-api';
import { rupees } from '@/lib/vendor-types';

export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const { placed } = await searchParams;

  const order = await serverApiSafe<Order>(`/orders/${id}`);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/orders"
        className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
      >
        ← All orders
      </Link>

      {placed && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          🌱 Order placed. Each shop has been notified separately.
        </p>
      )}

      <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-zinc-500">
            Placed {new Date(order.placedAt).toLocaleString('en-IN')}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[order.status] ?? 'bg-zinc-100 text-zinc-600'}`}
        >
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </header>

      <OrderTracker
        masterOrderId={order.id}
        initial={order.vendorOrders.map((vendorOrder) => ({
          id: vendorOrder.id,
          orderNumber: vendorOrder.orderNumber,
          vendorName: vendorOrder.vendor.name,
          status: vendorOrder.status,
          rejectionReason: vendorOrder.rejectionReason ?? null,
        }))}
      />

      <section className="mt-6 space-y-4">
        {order.vendorOrders.map((vendorOrder) => (
          <article
            key={vendorOrder.id}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          >
            <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div>
                <Link
                  href={`/shops/${vendorOrder.vendor.slug}`}
                  className="text-sm font-medium hover:underline"
                >
                  🏪 {vendorOrder.vendor.name}
                </Link>
                <p className="text-xs text-zinc-500">{vendorOrder.orderNumber}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[vendorOrder.status] ?? 'bg-zinc-100 text-zinc-600'}`}
              >
                {ORDER_STATUS_LABEL[vendorOrder.status]}
              </span>
            </header>

            <ul className="divide-y divide-zinc-100 px-4 dark:divide-zinc-800">
              {vendorOrder.items.map((item) => (
                <li key={item.id} className="flex justify-between py-2.5 text-sm">
                  <span>
                    {item.quantity} × {item.productTitle}
                    <span className="ml-2 text-xs text-zinc-500">
                      {rupees(item.unitPrice)} each
                    </span>
                  </span>
                  <span className="tabular-nums">{rupees(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <footer className="flex justify-between px-4 py-2.5 text-xs text-zinc-500">
              <span>delivery {rupees(vendorOrder.deliveryFee)}</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {rupees(vendorOrder.total)}
              </span>
            </footer>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Delivering to
          </h2>
          <p className="font-medium">{order.recipientName}</p>
          <p className="text-zinc-500">{order.recipientPhone}</p>
          <p className="mt-1 text-zinc-500">
            {[order.addressLine1, order.addressLine2, order.city, order.pincode]
              .filter(Boolean)
              .join(', ')}
          </p>
          {order.notes && <p className="mt-2 text-xs text-zinc-400">“{order.notes}”</p>}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Payment
          </h2>
          <dl className="space-y-1">
            <div className="flex justify-between text-zinc-500">
              <dt>Items</dt>
              <dd className="tabular-nums">{rupees(order.itemsTotal)}</dd>
            </div>
            <div className="flex justify-between text-zinc-500">
              <dt>Delivery</dt>
              <dd className="tabular-nums">{rupees(order.deliveryFee)}</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-1 font-semibold dark:border-zinc-800">
              <dt>Total</dt>
              <dd className="tabular-nums">{rupees(order.grandTotal)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-zinc-400">Cash on delivery</p>
        </div>
      </section>
    </main>
  );
}
