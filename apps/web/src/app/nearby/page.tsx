import type { Metadata } from 'next';
import { NearbyExplorer } from '@/components/discovery/NearbyExplorer';

export const metadata: Metadata = {
  title: 'Nurseries near you · E-PlantShopping',
  description:
    'Find plant nurseries close to you, see who delivers to your door, and browse their catalogue.',
};

/** Deep links like /nearby?lat=12.97&lng=77.60 open straight at that point. */
export default async function NearbyPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const { lat, lng } = await searchParams;
  const parsed =
    lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : undefined;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Nurseries near you</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Distances are straight-line, measured by PostGIS from the shop’s exact coordinates. Green
          pins deliver to your spot; grey pins are pickup-only from where you are standing.
        </p>
      </header>

      <NearbyExplorer initialOrigin={parsed} />
    </main>
  );
}
