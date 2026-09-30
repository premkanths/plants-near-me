import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { LogoutButton } from './LogoutButton';

const ROLE_BADGE: Record<string, string> = {
  CUSTOMER: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  VENDOR: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  ADMIN: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold">
          🌱 E-PlantShopping
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          <Link href="/nearby" className="text-zinc-600 hover:text-emerald-600 dark:text-zinc-300">
            Nearby
          </Link>

          {user ? (
            <>
              {user.role === 'VENDOR' && (
                <Link
                  href="/vendor"
                  className="text-zinc-600 hover:text-emerald-600 dark:text-zinc-300"
                >
                  Dashboard
                </Link>
              )}
              {user.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="text-zinc-600 hover:text-emerald-600 dark:text-zinc-300"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/account"
                className="text-zinc-600 hover:text-emerald-600 dark:text-zinc-300"
              >
                {user.name}
              </Link>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[user.role]}`}
              >
                {user.role}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-zinc-600 hover:text-emerald-600 dark:text-zinc-300"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white transition hover:bg-emerald-700"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
