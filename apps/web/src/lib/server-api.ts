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

export interface ServerApiOptions {
  isPublic?: boolean;
  revalidate?: number;
  timeoutMs?: number;
}

export async function serverApi<T>(path: string, options?: ServerApiOptions): Promise<T> {
  const isPublic = options?.isPublic ?? false;
  const token = isPublic ? undefined : await getAccessToken();
  const url = getApiUrl(path);

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? (isPublic ? 4000 : 7000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
      ...(token
        ? { cache: 'no-store' as const }
        : { next: { revalidate: options?.revalidate ?? 60 } }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `API request failed (${response.status})`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Same as serverApi but returns null instead of throwing — for optional data. */
export async function serverApiSafe<T>(path: string, options?: ServerApiOptions): Promise<T | null> {
  try {
    return await serverApi<T>(path, options);
  } catch {
    return null;
  }
}

