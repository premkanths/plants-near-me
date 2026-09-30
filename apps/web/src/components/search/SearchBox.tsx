'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import type { Suggestions } from '@/lib/search-types';

/**
 * Search input with trigram-backed autocomplete.
 * Suggestions are advisory: pressing Enter always searches the typed text.
 */
export function SearchBox({
  value,
  onChange,
  onSubmit,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (term: string) => void;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestions>({ plants: [], shops: [] });
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const options = [
    ...suggestions.plants.map((p) => ({ ...p, kind: 'plant' as const })),
    ...suggestions.shops.map((s) => ({ ...s, kind: 'shop' as const })),
  ];

  useEffect(() => {
    const term = value.trim();
    const empty = { plants: [], shops: [] };

    // Debounced so a fast typist triggers one request, not one per keystroke.
    const timer = setTimeout(() => {
      if (term.length < 2) {
        setSuggestions(empty);
        return;
      }
      api
        .get<Suggestions>(`/api/search/suggest?q=${encodeURIComponent(term)}`)
        .then(setSuggestions)
        .catch(() => setSuggestions(empty));
    }, 150);

    return () => clearTimeout(timer);
  }, [value]);

  // Clicking anywhere else dismisses the dropdown.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (term: string) => {
    onChange(term);
    onSubmit(term);
    setOpen(false);
    setHighlight(-1);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setOpen(false);
          onSubmit(value);
        }}
      >
        <input
          type="search"
          value={value}
          autoFocus={autoFocus}
          placeholder="Search plants, species or shops…"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!open || options.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlight((current) => (current + 1) % options.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((current) => (current - 1 + options.length) % options.length);
            } else if (event.key === 'Enter' && highlight >= 0) {
              event.preventDefault();
              choose(options[highlight].label);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 pr-11 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-sm text-zinc-400 hover:text-emerald-600"
        >
          🔍
        </button>
      </form>

      {open && options.length > 0 && (
        <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {options.map((option, index) => (
            <li key={`${option.kind}-${option.slug}`}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(option.label)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  index === highlight ? 'bg-emerald-50 dark:bg-emerald-950' : ''
                }`}
              >
                <span>{option.label}</span>
                <span className="text-xs text-zinc-400">
                  {option.kind === 'plant' ? 'plant' : 'shop'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
