import { NextResponse } from 'next/server';
import type { AuthResponse } from '@/lib/auth-types';
import { clearSession, getAccessToken, getRefreshToken, writeSession } from '@/lib/session';

/**
 * Authenticated proxy to the NestJS API (BFF pattern).
 *
 * - the browser calls same-origin `/api/...` and never holds a JWT
 * - the access token is read from an httpOnly cookie and injected here
 * - on a 401 the refresh token is used once, cookies are rotated, request retried
 */
const API = process.env.API_BASE_URL ?? 'http://localhost:3001';

async function forward(request: Request, path: string[]): Promise<NextResponse> {
  const url = new URL(request.url);
  const target = `${API}/api/${path.join('/')}${url.search}`;
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();

  const call = async (token?: string): Promise<Response> =>
    fetch(target, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      cache: 'no-store',
    });

  let upstream: Response;
  try {
    upstream = await call(await getAccessToken());
  } catch {
    return NextResponse.json({ message: 'Cannot reach the API. Is it running?' }, { status: 502 });
  }

  if (upstream.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      upstream = await call(refreshed);
    } else {
      await clearSession();
    }
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

/** Exchanges the refresh cookie for a fresh token pair. Returns the new access token. */
async function tryRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const auth = (await res.json()) as AuthResponse;
    await writeSession(auth, auth.user);
    return auth.accessToken;
  } catch {
    return null;
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function PUT(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
