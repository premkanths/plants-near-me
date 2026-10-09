'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Legend } from '@/components/ui';
import { HOME_BY_ROLE, type AuthUser } from '@/lib/auth-types';

type AccountType = 'customer' | 'vendor';

export default function RegisterPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>('customer');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState({ latitude: '', longitude: '' });

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not support location lookup — enter coordinates manually.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
        setLocating(false);
      },
      () => {
        setError('Location permission denied — enter your shop coordinates manually.');
        setLocating(false);
      },
      { timeout: 10_000 },
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const base = {
      email: form.get('email'),
      password: form.get('password'),
      name: form.get('name'),
      phone: (form.get('phone') as string) || undefined,
    };

    const payload =
      accountType === 'customer'
        ? base
        : {
            ...base,
            vendor: {
              name: form.get('shopName'),
              description: (form.get('description') as string) || undefined,
              addressLine: (form.get('addressLine') as string) || undefined,
              city: (form.get('city') as string) || undefined,
              pincode: (form.get('pincode') as string) || undefined,
              latitude: Number(form.get('latitude')),
              longitude: Number(form.get('longitude')),
              deliveryRadiusKm: Number(form.get('deliveryRadiusKm')) || undefined,
            },
          };

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: accountType === 'customer' ? 'register-customer' : 'register-vendor',
          payload,
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; message?: string };
      if (!res.ok || !data.user) throw new Error(data.message ?? 'Registration failed');

      router.replace(HOME_BY_ROLE[data.user.role] ?? '/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
        <p className="mb-5 text-sm text-zinc-500">Shop for plants, or sell them as a nursery.</p>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {(['customer', 'vendor'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAccountType(type)}
              className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                accountType === type
                  ? 'bg-white text-emerald-700 shadow-sm dark:bg-zinc-900 dark:text-emerald-400'
                  : 'text-zinc-500'
              }`}
            >
              {type === 'customer' ? '🛒 Customer' : '🌿 Vendor'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field label="Full name" name="name" required maxLength={80} />
          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 8 characters with upper case, lower case and a digit"
          />
          <Field label="Phone" name="phone" type="tel" placeholder="+919800000000" />

          {accountType === 'vendor' && (
            <fieldset className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <Legend>Shop details</Legend>
              <div className="space-y-4">
                <Field label="Shop name" name="shopName" required maxLength={120} />
                <Field label="Short description" name="description" maxLength={200} />
                <Field label="Address" name="addressLine" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" name="city" defaultValue="Bengaluru" />
                  <Field label="Pincode" name="pincode" placeholder="560001" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Latitude"
                    name="latitude"
                    required
                    value={coords.latitude}
                    onChange={(e) => setCoords((c) => ({ ...c, latitude: e.target.value }))}
                    placeholder="12.9716"
                  />
                  <Field
                    label="Longitude"
                    name="longitude"
                    required
                    value={coords.longitude}
                    onChange={(e) => setCoords((c) => ({ ...c, longitude: e.target.value }))}
                    placeholder="77.5946"
                  />
                </div>
                <Button type="button" variant="ghost" onClick={useMyLocation} loading={locating}>
                  📍 Use my current location
                </Button>
                <Field
                  label="Delivery radius (km)"
                  name="deliveryRadiusKm"
                  type="number"
                  step="0.5"
                  min="0.5"
                  defaultValue="5"
                />
                <p className="text-xs text-zinc-400">
                  New shops are reviewed by an admin before they appear in search results.
                </p>
              </div>
            </fieldset>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-sm text-zinc-500">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-emerald-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
