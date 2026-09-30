'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api-client';
import type { PlantSummary, VendorProduct } from '@/lib/vendor-types';

interface Props {
  plants: PlantSummary[];
  product?: VendorProduct;
}

const POT_SIZES = ['4 inch', '6 inch', '8 inch', '10 inch', '12 inch'];

export function ProductForm({ plants, product }: Props) {
  const router = useRouter();
  const editing = Boolean(product);

  const [plantId, setPlantId] = useState(product?.plantId ?? '');
  const [title, setTitle] = useState(product?.title ?? '');
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedPlant = plants.find((p) => p.id === plantId);

  /** Suggest a title when the vendor picks a plant (only if they haven't typed one). */
  function onPlantChange(id: string) {
    setPlantId(id);
    const plant = plants.find((p) => p.id === id);
    if (plant && (!title || plants.some((p) => title.startsWith(p.commonName)))) {
      setTitle(plant.commonName);
    }
  }

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const result = await api.upload<{ url: string }>('/api/uploads/product-image', file);
      setImages((current) => [...current, result.url]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get('title') ?? '').trim(),
      description: (form.get('description') as string) || undefined,
      price: Number(form.get('price')),
      stock: Number(form.get('stock')),
      potSize: (form.get('potSize') as string) || undefined,
      images,
      active: form.get('active') === 'on',
    };

    try {
      if (editing) {
        await api.patch(`/api/vendor/products/${product!.id}`, payload);
      } else {
        await api.post('/api/vendor/products', { ...payload, plantId });
      }
      router.push('/vendor');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the product');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <Alert>{error}</Alert>}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Plant species <span className="text-rose-500">*</span>
        </span>
        <select
          value={plantId}
          onChange={(e) => onPlantChange(e.target.value)}
          disabled={editing}
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Select a plant…</option>
          {plants.map((plant) => (
            <option key={plant.id} value={plant.id}>
              {plant.commonName} — {plant.scientificName}
            </option>
          ))}
        </select>
        {editing && (
          <span className="mt-1 block text-xs text-zinc-400">
            The species can&apos;t be changed — create a new listing instead.
          </span>
        )}
        {selectedPlant && (
          <span className="mt-1 block text-xs text-zinc-500">
            {selectedPlant.sunlight.replace('_', ' ').toLowerCase()} · water{' '}
            {selectedPlant.water.toLowerCase()} · {selectedPlant.difficulty.toLowerCase()} ·{' '}
            {selectedPlant.placement.toLowerCase()}
          </span>
        )}
      </label>

      <Field
        label="Listing title"
        name="title"
        required
        maxLength={140}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Description
        </span>
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={product?.description ?? ''}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Price (₹)"
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={product?.price ?? ''}
        />
        <Field
          label="Stock"
          name="stock"
          type="number"
          min="0"
          required
          defaultValue={product?.stock ?? 0}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Pot size
        </span>
        <select
          name="potSize"
          defaultValue={product?.potSize ?? ''}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Not specified</option>
          {POT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Photos
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {images.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-20 w-20 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
              />
              <button
                type="button"
                onClick={() => setImages((current) => current.filter((i) => i !== url))}
                className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-rose-600 text-xs text-white"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-emerald-500 dark:border-zinc-700">
            {uploading ? '…' : '+ Photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={onUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-400">JPEG, PNG, WebP or AVIF · up to 5 MB each</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
          className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
        />
        Visible to customers
      </label>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={saving}>
          {editing ? 'Save changes' : 'Add product'}
        </Button>
        <Link
          href="/vendor"
          className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
