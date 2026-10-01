'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { Cart, Order } from '@/lib/cart-types';
import { payWithRazorpay, type PaymentHandle } from '@/lib/payments';
import { rupees } from '@/lib/vendor-types';

interface Problem {
  productId?: string;
  vendorId?: string;
  reason: string;
}

export function CheckoutForm({
  cart,
  defaultName,
  defaultPhone,
}: {
  cart: Cart;
  defaultName: string;
  defaultPhone: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [method, setMethod] = useState<'COD' | 'ONLINE'>('COD');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setProblems([]);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...form.entries()].filter(([key, value]) => value !== '' && key !== 'paymentChoice'),
    ) as Record<string, string>;

    try {
      const order = await api.post<Order & { payment?: PaymentHandle }>('/api/orders/checkout', {
        ...payload,
        paymentMethod: method,
      });

      // An online order exists but is not live yet: it stays in
      // PENDING_PAYMENT, holding stock, until the payment is confirmed.
      if (method === 'ONLINE' && order.payment) {
        await payWithRazorpay(order.id, order.payment, {
          name: payload.recipientName,
          phone: payload.recipientPhone,
        });
      }

      // Nothing is left to go back to — the cart is now an order.
      router.replace(`/orders/${order.id}?placed=1`);
    } catch (cause) {
      setSubmitting(false);

      if (cause instanceof ApiError && cause.status === 409) {
        // The API returns every conflict at once; show them all and re-read
        // the cart so quantities and stock warnings are current again.
        setError(cause.message);
        router.refresh();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : 'Could not place the order');
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">Delivery address</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recipient name" name="recipientName" defaultValue={defaultName} required />
          <Field
            label="Phone"
            name="recipientPhone"
            defaultValue={defaultPhone}
            placeholder="9876543210"
            required
          />
        </div>

        <Field label="Address line 1" name="addressLine1" required />
        <Field label="Address line 2" name="addressLine2" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" defaultValue="Bengaluru" required />
          <Field label="Pincode" name="pincode" placeholder="560034" required />
        </div>

        <Field label="Delivery notes (optional)" name="notes" placeholder="Ring the bell twice" />

        <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <strong className="font-medium">Payment:</strong> cash on delivery. Online payment arrives
          in a later step.
        </div>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">
          {cart.vendorGroups.length === 1
            ? 'Your order'
            : `Your order · ${cart.vendorGroups.length} shops`}
        </h2>

        <ul className="space-y-3 text-sm">
          {cart.vendorGroups.map((group) => (
            <li key={group.vendorId}>
              <p className="text-xs font-medium text-zinc-500">{group.vendorName}</p>
              {group.lines.map((line) => (
                <p key={line.id} className="flex justify-between text-xs">
                  <span className="truncate pr-2">
                    {line.quantity} × {line.title}
                  </span>
                  <span className="tabular-nums">{rupees(line.lineTotal)}</span>
                </p>
              ))}
              <p className="flex justify-between text-xs text-zinc-500">
                <span>delivery</span>
                <span className="tabular-nums">{rupees(group.deliveryFee)}</span>
              </p>
            </li>
          ))}
        </ul>

        <div className="flex justify-between border-t border-zinc-100 pt-3 text-base font-semibold dark:border-zinc-800">
          <span>Total</span>
          <span>{rupees(cart.grandTotal)}</span>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
            <p>{error}</p>
            {problems.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {problems.map((problem, index) => (
                  <li key={index}>{problem.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Payment
          </legend>
          {(
            [
              ['COD', 'Cash on delivery', 'Pay each shop at the door'],
              ['ONLINE', 'Pay now (Razorpay)', 'Test mode — no real money moves'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                method === value
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800'
              }`}
            >
              <input
                type="radio"
                name="paymentChoice"
                value={value}
                checked={method === value}
                onChange={() => setMethod(value)}
                className="mt-0.5 accent-emerald-600"
              />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-zinc-500">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          disabled={submitting || !cart.checkoutReady}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting
            ? method === 'ONLINE'
              ? 'Taking you to payment…'
              : 'Placing your order…'
            : `${method === 'ONLINE' ? 'Pay' : 'Place order ·'} ${rupees(cart.grandTotal)}`}
        </button>
      </aside>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
      {label}
      {required && <span className="text-rose-500"> *</span>}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </label>
  );
}
