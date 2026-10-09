import { cookies } from 'next/headers';
import type { AuthTokens, AuthUser } from './auth-types';

/**
 * Session handling uses the BFF pattern: the browser never sees a JWT.
 * Access/refresh tokens live in httpOnly cookies that only the Next.js server
 * can read; a small non-sensitive `eplant_user` cookie mirrors id/name/role so
 * middleware and the UI can render without an extra round trip.
 */
export const ACCESS_COOKIE = 'eplant_access';
export const REFRESH_COOKIE = 'eplant_refresh';
export const USER_COOKIE = 'eplant_user';

const isProduction = process.env.NODE_ENV === 'production';

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
};

export async function writeSession(tokens: AuthTokens, user: AuthUser): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, { ...baseCookie, maxAge: tokens.expiresIn });
  store.set(REFRESH_COOKIE, tokens.refreshToken, { ...baseCookie, maxAge: 60 * 60 * 24 * 7 });
  store.set(USER_COOKIE, JSON.stringify(user), {
    ...baseCookie,
    httpOnly: false, // read by middleware + client UI; contains no secrets
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) {
    store.set(name, '', { ...baseCookie, httpOnly: name !== USER_COOKIE, maxAge: 0 });
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
