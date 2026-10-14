import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from './ThemeToggle';
import { BackButton } from './BackButton';

const ROLE_BADGE: Record<string, string> = {
  CUSTOMER: 'bg-sky-100/90 text-sky-800 border border-sky-300 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800',
  VENDOR: 'bg-emerald-100/90 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800',
  ADMIN: 'bg-amber-100/90 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800',
};

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-emerald-900/10 bg-white/85 backdrop-blur-xl transition dark:border-emerald-500/10 dark:bg-zinc-950/85">
      <div className="flex w-full items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Left Side: Back Button + Brand Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <BackButton />

          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-xl text-white shadow-md shadow-emerald-500/20 transition transform duration-300 group-hover:scale-105 group-hover:shadow-emerald-500/30">
              🌱
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-black tracking-tight text-zinc-900 dark:text-zinc-50 text-base leading-tight">
                E-PlantShopping
              </span>
              <span className="text-[10px] font-bold tracking-wide text-emerald-700 dark:text-emerald-400 uppercase">
                Local Nurseries · Bengaluru
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1.5 sm:gap-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200">
          {/* Theme Mode Switcher */}
          <div className="mr-0.5 sm:mr-1">
            <ThemeToggle />
          </div>

          <Link 
            href="/search" 
            className="rounded-xl px-3 py-2 transition hover:bg-emerald-50/80 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 flex items-center gap-1.5"
          >
            <span>🔍</span>
            <span className="hidden sm:inline">Search Plants</span>
          </Link>

          <Link 
            href="/nearby" 
            className="rounded-xl px-3 py-2 transition hover:bg-emerald-50/80 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 flex items-center gap-1.5"
          >
            <span>🗺️</span>
            <span className="hidden sm:inline">Nearby Map</span>
          </Link>

          {user ? (
            <>
              {user.role === 'VENDOR' && (
                <Link
                  href="/vendor"
                  className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-800 transition hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50 flex items-center gap-1.5"
                >
                  <span>📊</span>
                  <span>Vendor Hub</span>
                </Link>
              )}

              {user.role === 'CUSTOMER' && (
                <>
                  <Link
                    href="/orders"
                    className="rounded-xl px-3 py-2 transition hover:bg-emerald-50/80 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 flex items-center gap-1.5"
                  >
                    <span>📦</span>
                    <span className="hidden md:inline">Orders</span>
                  </Link>
                  <Link
                    href="/cart"
                    className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 font-bold text-white transition hover:from-emerald-700 hover:to-teal-700 flex items-center gap-1.5 shadow-sm shadow-emerald-600/20"
                  >
                    <span>🛒</span>
                    <span>Cart</span>
                  </Link>
                </>
              )}

              {user.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="rounded-xl px-3 py-2 transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 flex items-center gap-1.5"
                >
                  <span>🛡️</span>
                  <span>Admin</span>
                </Link>
              )}

              <div className="ml-1 sm:ml-2 flex items-center gap-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
                <Link
                  href="/account"
                  className="hidden md:block font-bold text-zinc-900 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400 max-w-[120px] truncate"
                >
                  {user.name}
                </Link>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-2xs ${ROLE_BADGE[user.role]}`}
                >
                  {user.role}
                </span>
                <LogoutButton />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 pl-2">
              <Link
                href="/cart"
                className="rounded-2xl bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 font-bold text-emerald-800 hover:bg-emerald-100 transition dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 shadow-2xs"
              >
                <span>🛒</span>
                <span>Cart</span>
              </Link>
              <Link
                href="/login"
                className="rounded-xl px-3 py-1.5 text-zinc-700 hover:text-emerald-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 font-bold text-white transition hover:from-emerald-700 hover:to-teal-700 shadow-sm shadow-emerald-600/20"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
