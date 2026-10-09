import { NextResponse } from 'next/server';
import type { AuthResponse } from '@/lib/auth-types';
import { clearSession, getAccessToken, writeSession } from '@/lib/session';

const API = process.env.API_BASE_URL ?? 'http://localhost:3001';

interface SessionRequest {
  intent: 'login' | 'register-customer' | 'register-vendor';
  payload: Record<string, unknown>;
}

const ENDPOINTS: Record<SessionRequest['intent'], string> = {
  login: '/api/auth/login',
  'register-customer': '/api/auth/register',
  'register-vendor': '/api/auth/register/vendor',
};

/** Logs in or registers, then stores the tokens in httpOnly cookies. */
export async function POST(request: Request) {
  let body: SessionRequest;
  try {
    body = (await request.json()) as SessionRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const endpoint = ENDPOINTS[body?.intent];
  if (!endpoint) return NextResponse.json({ message: 'Unknown intent' }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body.payload ?? {}),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Cannot reach the API. Is it running?' }, { status: 502 });
  }

  const data: unknown = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = extractMessage(data) ?? 'Request failed';
    return NextResponse.json({ message }, { status: upstream.status });
  }

  const auth = data as AuthResponse;
  await writeSession(auth, auth.user);
  return NextResponse.json({ user: auth.user });
}

/** Logout: tells the API to drop the refresh token, then clears cookies. */
export async function DELETE() {
  const accessToken = await getAccessToken();
  if (accessToken) {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }
  await clearSession();
  return NextResponse.json({ success: true });
}

function extractMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(', ');
  return null;
}
