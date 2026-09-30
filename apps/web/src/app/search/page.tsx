import type { Metadata } from 'next';
import { SearchExplorer } from '@/components/search/SearchExplorer';

export const metadata: Metadata = {
  title: 'Search plants · E-PlantShopping',
  description: 'Search every nursery on the marketplace by plant name, species or care needs.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Search the marketplace</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Full-text search across listing titles, species names and care notes. Misspell it and
          trigram matching still finds the plant.
        </p>
      </header>

      <SearchExplorer initialQuery={q ?? ''} />
    </main>
  );
}
