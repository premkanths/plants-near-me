'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { rupees, type VendorProduct } from '@/lib/vendor-types';
import { Alert } from '@/components/ui';

function StockBadge({ stock }: { stock: number }) {
  const [label, styles] =
    stock === 0
      ? ['Out of stock', 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300']
      : stock <= 5
        ? ['Low', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300']
        : ['In stock', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{label}</span>;
}

/** Inline stock editor — saves on blur/Enter, rolls back on failure. */
function StockCell({ product, onError }: { product: VendorProduct; onError: (m: string) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(String(product.stock));
  const [saving, setSaving] = useState(false);

  async function save() {
    const stock = Number(value);
    if (!Number.isInteger(stock) || stock < 0 || stock === product.stock) {
      setValue(String(product.stock));
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/vendor/products/${product.id}/stock`, { stock });
      router.refresh();
    } catch (error) {
      setValue(String(product.stock));
      onError(error instanceof ApiError ? error.message : 'Could not update stock');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <StockBadge stock={product.stock} />
    </div>
  );
}

export function InventoryTable({ products }: { products: VendorProduct[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function remove(product: VendorProduct) {
    if (!confirm(`Remove "${product.title}" from your shop?`)) return;
    try {
      const result = await api.delete<{ deleted: boolean; reason?: string }>(
        `/api/vendor/products/${product.id}`,
      );
      if (!result.deleted) setError(`Deactivated instead of deleted — ${result.reason}`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the product');
    }
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
        <p className="mb-1 font-medium">No products yet</p>
        <p className="mb-4 text-sm text-zinc-500">Add your first plant to start selling.</p>
        <Link
          href="/vendor/products/new"
          className="inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Add product
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs tracking-wider text-zinc-500 uppercase dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Pot</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {products.map((product) => (
              <tr key={product.id} className={pending ? 'opacity-60' : undefined}>
                <td className="px-4 py-3">
                  <div className="font-medium">{product.title}</div>
                  <div className="text-xs text-zinc-500 italic">{product.plant.scientificName}</div>
                </td>
                <td className="px-4 py-3 text-zinc-500">{product.potSize ?? '—'}</td>
                <td className="px-4 py-3 font-medium">{rupees(product.price)}</td>
                <td className="px-4 py-3">
                  <StockCell product={product} onError={setError} />
                </td>
                <td className="px-4 py-3">
                  {product.active ? (
                    <span className="text-emerald-600">Listed</span>
                  ) : (
                    <span className="text-zinc-400">Hidden</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`/vendor/products/${product.id}`}
                    className="mr-3 font-medium text-emerald-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => remove(product)}
                    className="font-medium text-rose-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
