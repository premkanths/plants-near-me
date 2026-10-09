'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/vendors', label: 'Nurseries' },
  { href: '/admin/users', label: 'Users' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              active
                ? 'border-emerald-600 font-medium text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
