import { HealthCard } from '@/components/HealthCard';
import { RecommendationGrid } from '@/components/recommendations/RecommendationGrid';
import { fetchHealth } from '@/lib/api';
import type { RecommendationResponse } from '@/lib/recommendation-types';
import { serverApiSafe } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

const roadmap = [
  { step: 1, title: 'Monorepo, Docker, health check', done: true },
  { step: 2, title: 'Database schema + PostGIS + seed', done: true },
  { step: 3, title: 'Auth & roles (JWT)', done: true },
  { step: 4, title: 'Vendor dashboard', done: true },
  { step: 5, title: 'Nearby nursery discovery', done: true },
  { step: 6, title: 'Search & filters (FTS + trigram)', done: true },
  { step: 7, title: 'Cart & multi-vendor checkout', done: true },
  { step: 8, title: 'Order tracking in realtime', done: true },
  { step: 9, title: 'Payments (Razorpay test mode + COD)', done: true },
  { step: 10, title: 'Reviews & ratings', done: true },
  { step: 11, title: 'Admin console & analytics', done: true },
  { step: 12, title: 'Recommendations', done: true },
];

export default async function Home() {
  // The same endpoint serves both audiences: signed-in shoppers get picks
  // shaped by their history, everyone else gets popular-and-nearby.
  const [health, picks] = await Promise.all([
    fetchHealth(),
    serverApiSafe<RecommendationResponse>('/recommendations?limit=4'),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-16">
      <header className="text-center">
        <p className="mb-2 text-sm font-medium tracking-widest text-emerald-600 uppercase">
          🌱 E-PlantShopping 2.0
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">Multi-Vendor Plant Marketplace</h1>
        <p className="mt-3 text-zinc-500">
          Find nurseries near you, shop across vendors, track every order.
        </p>
      </header>

      <div className="flex flex-wrap justify-center gap-3">
        <a
          href="/search"
          className="rounded-xl border border-emerald-600 px-5 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
        >
          🔍 Search plants
        </a>
        <a
          href="/nearby"
          className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          📍 Find nurseries near me
        </a>
      </div>

      {picks && picks.items.length > 0 && (
        <section className="w-full">
          <h2 className="mb-1 text-sm font-semibold tracking-wider text-zinc-400 uppercase">
            {picks.personalised ? 'Picked for you' : 'Popular right now'}
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            {picks.personalised
              ? `Based on ${picks.basedOn} plant${picks.basedOn === 1 ? '' : 's'} you have bought`
              : 'Well rated, in stock and easy to keep alive'}
          </p>
          <RecommendationGrid items={picks.items} />
        </section>
      )}

      <HealthCard initial={health} />

      <section className="w-full max-w-xl">
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-zinc-400 uppercase">
          Build roadmap
        </h2>
        <ol className="space-y-2">
          {roadmap.map((item) => (
            <li
              key={item.step}
              className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  item.done
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                }`}
              >
                {item.done ? '✓' : item.step}
              </span>
              <span className={item.done ? '' : 'text-zinc-400'}>{item.title}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
