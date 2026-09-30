'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Legend } from '@/components/ui';
import { api, ApiError } from '@/lib/api-client';
import type { VendorProfile } from '@/lib/vendor-types';

export function ShopSettingsForm({ profile }: { profile: VendorProfile }) {
  const router = useRouter();
  const [coords, setCoords] = useState({
    latitude: String(profile.latitude),
    longitude: String(profile.longitude),
  });
  const [radius, setRadius] = useState(profile.deliveryRadiusKm);
  const [status, setStatus] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus({ kind: 'error', text: 'Your browser cannot detect location — type it manually.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }),
      () => setStatus({ kind: 'error', text: 'Location permission denied.' }),
      { timeout: 10_000 },
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setSaving(true);

    const form = new FormData(event.currentTarget);
    try {
      await api.patch('/api/vendor/profile', {
        name: form.get('name'),
        description: (form.get('description') as string) || undefined,
        phone: (form.get('phone') as string) || undefined,
        addressLine: (form.get('addressLine') as string) || undefined,
        city: form.get('city'),
        pincode: (form.get('pincode') as string) || undefined,
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
        deliveryRadiusKm: Number(form.get('deliveryRadiusKm')),
        deliveryFee: Number(form.get('deliveryFee')),
        minOrderValue: Number(form.get('minOrderValue')),
      });
      setStatus({ kind: 'info', text: 'Shop settings saved.' });
      router.refresh();
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not save your settings',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {status && <Alert kind={status.kind}>{status.text}</Alert>}

      <Field label="Shop name" name="name" required defaultValue={profile.name} maxLength={120} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          About your shop
        </span>
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={profile.description ?? ''}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <Field
        label="Phone"
        name="phone"
        defaultValue={profile.phone ?? ''}
        placeholder="+919800000000"
      />
      <Field label="Address" name="addressLine" defaultValue={profile.addressLine ?? ''} />

      <div className="grid grid-cols-2 gap-4">
        <Field label="City" name="city" defaultValue={profile.city} />
        <Field label="Pincode" name="pincode" defaultValue={profile.pincode ?? ''} />
      </div>

      <fieldset className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <Legend>Location on the map</Legend>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Latitude"
            value={coords.latitude}
            onChange={(e) => setCoords((c) => ({ ...c, latitude: e.target.value }))}
          />
          <Field
            label="Longitude"
            value={coords.longitude}
            onChange={(e) => setCoords((c) => ({ ...c, longitude: e.target.value }))}
          />
        </div>
        <div className="mt-3">
          <Button type="button" variant="ghost" onClick={useMyLocation}>
            📍 Use my current location
          </Button>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <Legend>Delivery</Legend>
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span>Delivery radius</span>
            <span className="font-mono text-emerald-600">{radius} km</span>
          </span>
          <input
            type="range"
            name="deliveryRadiusKm"
            min={0.5}
            max={50}
            step={0.5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <span className="mt-1 block text-xs text-zinc-400">
            Customers outside this radius won&apos;t see your shop in nearby results.
          </span>
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field
            label="Delivery fee (₹)"
            name="deliveryFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={profile.deliveryFee}
          />
          <Field
            label="Minimum order (₹)"
            name="minOrderValue"
            type="number"
            min="0"
            step="0.01"
            defaultValue={profile.minOrderValue}
          />
        </div>
      </fieldset>

      <Button type="submit" loading={saving}>
        Save settings
      </Button>
    </form>
  );
}
