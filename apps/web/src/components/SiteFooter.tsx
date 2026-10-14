import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-emerald-900/10 bg-gradient-to-b from-white via-emerald-50/20 to-emerald-100/30 text-zinc-700 dark:border-emerald-500/10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 dark:text-zinc-300">
      {/* ── Value Proposition Ribbon ───────────────────────── */}
      <div className="border-b border-emerald-900/10 dark:border-emerald-500/10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 py-8 sm:grid-cols-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg dark:bg-emerald-950 dark:text-emerald-300">
              🌱
            </span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Direct From Growers
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Zero warehouse middle-storage. Straight from local greenhouses.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg dark:bg-emerald-950 dark:text-emerald-300">
              🪴
            </span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Potted & Root-Healthy
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Enriched with organic vermicompost & perlite, ready to thrive.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg dark:bg-emerald-950 dark:text-emerald-300">
              🛵
            </span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Same-Day Local Courier
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Carefully hand-delivered without boxing trauma or crushed leaves.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg dark:bg-emerald-950 dark:text-emerald-300">
              💚
            </span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                7-Day Health Guarantee
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Plant doctor assistance and instant replacement if unhappy.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Footer Links ──────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-lg text-white shadow-md shadow-emerald-500/20 transition transform group-hover:scale-105">
                🌱
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 text-base leading-tight">
                  E-PlantShopping
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Bengaluru’s Multi-Vendor Botanical Market
                </span>
              </div>
            </Link>

            <p className="mt-3 max-w-sm text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Find plant nurseries near you, order from multiple independent growers in a single unified checkout, and support local horticulturists in your city.
            </p>

            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>5 Verified Nurseries Open for Delivery Today</span>
            </div>
          </div>

          {/* Nurseries Column */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Explore Nurseries
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/shops/lalbagh-green-nursery" className="hover:text-emerald-600 transition">
                  Lalbagh Green Nursery
                </Link>
              </li>
              <li>
                <Link href="/shops/indiranagar-urban-jungle" className="hover:text-emerald-600 transition">
                  Indiranagar Urban Jungle
                </Link>
              </li>
              <li>
                <Link href="/shops/whitefield-plant-studio" className="hover:text-emerald-600 transition">
                  Whitefield Plant Studio
                </Link>
              </li>
              <li>
                <Link href="/shops/jayanagar-flower-bazaar" className="hover:text-emerald-600 transition">
                  Jayanagar Flower Bazaar
                </Link>
              </li>
              <li>
                <Link href="/nearby" className="font-semibold text-emerald-600 hover:underline">
                  🗺️ View Map Explorer →
                </Link>
              </li>
            </ul>
          </div>

          {/* Plant Categories */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Plant Categories
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/search?placement=INDOOR" className="hover:text-emerald-600 transition">
                  🪴 Indoor Houseplants
                </Link>
              </li>
              <li>
                <Link href="/search?placement=OUTDOOR" className="hover:text-emerald-600 transition">
                  🌴 Balcony & Outdoor
                </Link>
              </li>
              <li>
                <Link href="/search?petFriendly=true" className="hover:text-emerald-600 transition">
                  🐾 Pet-Safe Varieties
                </Link>
              </li>
              <li>
                <Link href="/search?airPurifying=true" className="hover:text-emerald-600 transition">
                  🍃 Air Purifiers
                </Link>
              </li>
              <li>
                <Link href="/search?difficulty=EASY" className="hover:text-emerald-600 transition">
                  ⚡ Beginner Friendly
                </Link>
              </li>
            </ul>
          </div>

          {/* Grower Network / Sell */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              For Nurseries
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/register" className="hover:text-emerald-600 transition">
                  Partner with Us (Register Nursery)
                </Link>
              </li>
              <li>
                <Link href="/vendor" className="hover:text-emerald-600 transition">
                  Vendor Portal & Orders
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-emerald-600 transition">
                  Admin Platform Console
                </Link>
              </li>
              <li>
                <a href="#care-guide" className="hover:text-emerald-600 transition">
                  Botanical Care Guide
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* ── Bottom Disclaimer & Status ───────────────────── */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-200/80 pt-6 text-center text-[11px] text-zinc-500 sm:flex-row sm:text-left dark:border-zinc-800">
          <p>© {new Date().getFullYear()} E-PlantShopping 2.0. Handcrafted for plant enthusiasts in Bengaluru.</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              PostGIS Spatial Engine Active
            </span>
            <span>·</span>
            <Link href="/search" className="hover:underline">
              Quick Search
            </Link>
            <span>·</span>
            <Link href="/cart" className="hover:underline">
              Multi-Vendor Cart
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
