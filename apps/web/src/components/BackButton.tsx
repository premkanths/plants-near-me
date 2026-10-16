'use client';

import { usePathname, useRouter } from 'next/navigation';

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === '/') return null;

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      title="Go back one step"
      aria-label="Go back one step"
      className="group flex h-9 items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-white/90 px-2.5 py-1 text-xs font-bold text-zinc-700 shadow-2xs backdrop-blur transition-all duration-200 hover:-translate-x-0.5 hover:border-emerald-500/40 hover:bg-emerald-50/80 hover:text-emerald-800 dark:border-emerald-500/20 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300"
    >
      <svg
        className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 19l-7-7 7-7" />
      </svg>
      <span className="hidden sm:inline font-semibold">Back</span>
    </button>
  );
}
