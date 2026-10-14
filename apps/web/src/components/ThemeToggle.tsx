'use client';

import { useEffect, useState, useRef } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [resolvedDark, setResolvedDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initialize theme from localStorage & system preference
  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem('eplant_theme') as ThemeMode) || 'system';
    setTheme(stored);
    applyTheme(stored);

    // Close dropdown on outside click
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to system changes if theme is 'system'
  useEffect(() => {
    if (!mounted) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  function applyTheme(mode: ThemeMode) {
    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    setResolvedDark(isDark);
  }

  function handleSelect(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem('eplant_theme', mode);
    applyTheme(mode);
    setIsOpen(false);
  }

  // Quick 1-click toggle between light and dark
  function handleQuickToggle() {
    const nextMode = resolvedDark ? 'light' : 'dark';
    handleSelect(nextMode);
  }

  if (!mounted) {
    // Render skeleton during SSR to avoid hydration mismatch
    return (
      <div className="h-9 w-9 rounded-xl border border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50" />
    );
  }

  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      {/* 1-Click Quick Toggle Pill */}
      <div className="flex items-center rounded-xl border border-emerald-900/10 bg-white/80 p-0.5 shadow-xs backdrop-blur-md transition-all hover:border-emerald-500/30 dark:border-emerald-500/20 dark:bg-zinc-900/80">
        <button
          type="button"
          onClick={handleQuickToggle}
          title={resolvedDark ? 'Switch to Light Theme (Current: Dark)' : 'Switch to Dark Theme (Current: Light)'}
          aria-label={resolvedDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold transition hover:bg-emerald-50 text-zinc-700 dark:text-zinc-200 dark:hover:bg-emerald-950/60"
        >
          {resolvedDark ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <svg className="h-4 w-4 animate-spin-once" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="currentColor" fillOpacity="0.15" />
              </svg>
              <span className="hidden md:inline font-semibold">Dark</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-500">
              <svg className="h-4 w-4 animate-spin-once" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <span className="hidden md:inline font-semibold text-zinc-800">Light</span>
            </span>
          )}
        </button>

        {/* Dropdown Chevron for System Mode selection */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title="Theme Options (Light, Dark, System)"
          aria-label="Theme Options"
          aria-expanded={isOpen}
          className="flex h-8 w-6 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl border border-emerald-900/10 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 dark:border-emerald-500/20 dark:bg-zinc-900/95">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Appearance
          </div>

          <button
            type="button"
            onClick={() => handleSelect('light')}
            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
              theme === 'light'
                ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/70'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-amber-500">☀️</span>
              <span>Light Mode</span>
            </span>
            {theme === 'light' && <span className="text-amber-600 dark:text-amber-400 text-xs">✓</span>}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('dark')}
            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
              theme === 'dark'
                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/70'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-emerald-400">🌙</span>
              <span>Dark Mode</span>
            </span>
            {theme === 'dark' && <span className="text-emerald-500 text-xs">✓</span>}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('system')}
            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
              theme === 'system'
                ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/70'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-zinc-500">💻</span>
              <span>System Auto</span>
            </span>
            {theme === 'system' && <span className="text-emerald-500 text-xs">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
