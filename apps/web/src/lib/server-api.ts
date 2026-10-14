import { getAccessToken } from './session';

/**
 * Server-side fetch to the NestJS API for React Server Components.
 * Reads the access token straight from the httpOnly cookie.
 */
function getApiUrl(path: string): string {
  let base = (process.env.API_BASE_URL ?? 'http://localhost:3001').trim();
  base = base.replace(/\/+$/, '');
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api${cleanPath}`;
}

export async function serverApi<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const url = getApiUrl(path);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `API request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** Same as serverApi but returns null instead of throwing — for optional data. */
export async function serverApiSafe<T>(path: string): Promise<T | null> {
  try {
    return await serverApi<T>(path);
  } catch {
    return null;
  }
}
