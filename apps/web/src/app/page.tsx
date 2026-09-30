import { HealthCard } from '@/components/HealthCard';
import { fetchHealth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const roadmap = [
  { step: 1, title: 'Monorepo, Docker, health check', done: true },
  { step: 2, title: 'Database schema + PostGIS + seed', done: true },
  { step: 3, title: 'Auth & roles (JWT)', done: true },
  { step: 4, title: 'Vendor dashboard', done: true },
  { step: 5, title: 'Nearby nursery discovery', done: false },
];

export default async function Home() {
  const health = await fetchHealth();

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-16">
      <header className="text-center">
        <p className="mb-2 text-sm font-medium tracking-widest text-emerald-600 uppercase">
          🌱 E-PlantShopping 2.0
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">Multi-Vendor Plant Marketplace</h1>
        <p className="mt-3 text-zinc-500">
          Find nurseries near you, shop across vendors, track every order.
        </p>
      </header>

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
