/**
 * Browser code uses relative URLs so requests are proxied by Next.js (see next.config.ts).
 * Server components need an absolute URL, hence API_BASE_URL.
 */
export const apiBaseUrl =
  typeof window === 'undefined'
    ? (process.env.API_BASE_URL ?? 'http://localhost:3001')
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? '');

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  db: { status: 'up' | 'down'; postgis: string | null; error?: string };
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}
