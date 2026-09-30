'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Card, Field } from '@/components/ui';
import { HOME_BY_ROLE, type AuthUser } from '@/lib/auth-types';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'login',
          payload: { email: form.get('email'), password: form.get('password') },
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; message?: string };
      if (!res.ok || !data.user) throw new Error(data.message ?? 'Login failed');

      router.replace(params.get('next') || HOME_BY_ROLE[data.user.role] || '/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-zinc-500">Log in to your E-PlantShopping account.</p>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        No account?{' '}
        <Link href="/register" className="font-medium text-emerald-600 hover:underline">
          Create one
        </Link>
      </p>

      <details className="mt-4 text-xs text-zinc-400">
        <summary className="cursor-pointer">Demo accounts</summary>
        <ul className="mt-2 space-y-1 font-mono">
          <li>customer@eplant.test · Password123!</li>
          <li>lalbagh@eplant.test · Password123! (vendor)</li>
          <li>admin@eplant.test · Password123! (admin)</li>
        </ul>
      </details>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
