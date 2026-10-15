/**
 * Browser code uses relative URLs so requests are proxied by Next.js (see next.config.ts).
 * Server components need an absolute URL, hence API_BASE_URL.
 */
function cleanBase(val?: string): string {
  let s = (val ?? '').trim().replace(/\/+$/, '');
  if (s.endsWith('/api')) s = s.slice(0, -4);
  return s;
}

export const apiBaseUrl =
  typeof window === 'undefined'
    ? cleanBase(process.env.API_BASE_URL ?? 'http://localhost:3001')
    : cleanBase(process.env.NEXT_PUBLIC_API_BASE_URL ?? '');

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  db: { status: 'up' | 'down'; postgis: string | null; error?: string };
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${apiBaseUrl}/api/health`, {
      next: { revalidate: 30 },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
