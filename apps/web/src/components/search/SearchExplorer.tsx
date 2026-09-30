'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import {
  DIFFICULTY_LABEL,
  SUNLIGHT_LABEL,
  WATER_LABEL,
  type SearchItem,
  type SearchResponse,
} from '@/lib/search-types';
import { rupees } from '@/lib/vendor-types';
import { SearchBox } from './SearchBox';

type Sort = 'relevance' | 'price_asc' | 'price_desc' | 'distance' | 'rating';

interface Filters {
  placement: string[];
  difficulty: string[];
  water: string[];
  petFriendly: boolean;
  airPurifying: boolean;
  flowering: boolean;
  maxPrice: number | null;
}

const EMPTY: Filters = {
  placement: [],
  difficulty: [],
  water: [],
  petFriendly: false,
  airPurifying: false,
  flowering: false,
  maxPrice: null,
};

const PAGE_SIZE = 12;

export function SearchExplorer({ initialQuery }: { initialQuery: string }) {
  const [term, setTerm] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>('relevance');
  const [page, setPage] = useState(1);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      sort,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (submitted.trim()) params.set('q', submitted.trim());
    if (filters.placement.length) params.set('placement', filters.placement.join(','));
    if (filters.difficulty.length) params.set('difficulty', filters.difficulty.join(','));
    if (filters.water.length) params.set('water', filters.water.join(','));
    if (filters.petFriendly) params.set('petFriendly', 'true');
    if (filters.airPurifying) params.set('airPurifying', 'true');
    if (filters.flowering) params.set('flowering', 'true');
    if (filters.maxPrice !== null) params.set('maxPrice', String(filters.maxPrice));
    if (near) {
      params.set('lat', String(near.lat));
      params.set('lng', String(near.lng));
      params.set('radiusKm', '10');
    }
    return params.toString();
  }, [submitted, filters, sort, page, near]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .get<SearchResponse>(`/api/search?${query}`)
        .then((response) => {
          if (!active) return;
          setData(response);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setError(cause instanceof ApiError ? cause.message : 'Search failed');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const submit = useCallback((next: string) => {
    setSubmitted(next);
    setPage(1);
  }, []);

  const toggle = useCallback((key: 'placement' | 'difficulty' | 'water', value: string) => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((entry) => entry !== value)
        : [...current[key], value],
    }));
  }, []);

  const toggleFlag = useCallback((key: 'petFriendly' | 'airPurifying' | 'flowering') => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const useMyLocation = () => {
    if (near) {
      setNear(null);
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setPage(1);
      },
      () => setError('Location permission denied'),
    );
  };

  const facets = data?.facets;
  const activeFilters =
    filters.placement.length +
    filters.difficulty.length +
    filters.water.length +
    (filters.petFriendly ? 1 : 0) +
    (filters.airPurifying ? 1 : 0) +
    (filters.flowering ? 1 : 0) +
    (filters.maxPrice !== null ? 1 : 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* ── Filters ─────────────────────────────────────────── */}
      <aside className="order-2 space-y-5 lg:order-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filters</h2>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY);
                setPage(1);
              }}
              className="text-xs text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Clear ({activeFilters})
            </button>
          )}
        </div>

        <FilterGroup title="Where it lives">
          <Chip
            label="Indoor"
            count={facets?.placement.indoor}
            active={filters.placement.includes('INDOOR')}
            onClick={() => toggle('placement', 'INDOOR')}
          />
          <Chip
            label="Outdoor"
            count={facets?.placement.outdoor}
            active={filters.placement.includes('OUTDOOR')}
            onClick={() => toggle('placement', 'OUTDOOR')}
          />
        </FilterGroup>

        <FilterGroup title="Care level">
          {(['EASY', 'MODERATE', 'HARD'] as const).map((level) => (
            <Chip
              key={level}
              label={DIFFICULTY_LABEL[level]}
              count={facets?.difficulty[level.toLowerCase() as 'easy' | 'moderate' | 'hard']}
              active={filters.difficulty.includes(level)}
              onClick={() => toggle('difficulty', level)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Watering">
          {(['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => (
            <Chip
              key={level}
              label={WATER_LABEL[level]}
              count={level === 'LOW' ? facets?.traits.lowWater : undefined}
              active={filters.water.includes(level)}
              onClick={() => toggle('water', level)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Good for">
          <Chip
            label="Pet friendly"
            count={facets?.traits.petFriendly}
            active={filters.petFriendly}
            onClick={() => toggleFlag('petFriendly')}
          />
          <Chip
            label="Air purifying"
            count={facets?.traits.airPurifying}
            active={filters.airPurifying}
            onClick={() => toggleFlag('airPurifying')}
          />
          <Chip
            label="Flowering"
            count={facets?.traits.flowering}
            active={filters.flowering}
            onClick={() => toggleFlag('flowering')}
          />
        </FilterGroup>

        <FilterGroup title="Budget">
          <div className="w-full">
            <input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={filters.maxPrice ?? 2000}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPage(1);
                setFilters((current) => ({
                  ...current,
                  maxPrice: value >= 2000 ? null : value,
                }));
              }}
              className="w-full accent-emerald-600"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {filters.maxPrice === null ? 'Any price' : `Up to ${rupees(filters.maxPrice)}`}
            </p>
          </div>
        </FilterGroup>

        <button
          type="button"
          onClick={useMyLocation}
          className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition ${
            near
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-zinc-200 text-zinc-600 hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-300'
          }`}
        >
          {near ? '✓ Within 10 km of me' : '📍 Only shops near me'}
        </button>
      </aside>

      {/* ── Results ─────────────────────────────────────────── */}
      <div className="order-1 lg:order-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[16rem] flex-1">
            <SearchBox value={term} onChange={setTerm} onSubmit={submit} autoFocus />
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="relevance">Most relevant</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="rating">Best rated shop</option>
            {near && <option value="distance">Nearest</option>}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <span>{loading ? 'Searching…' : `${data?.total ?? 0} results`}</span>
          {data?.strategy === 'fuzzy' && data.total > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              no exact match — showing closest spellings
            </span>
          )}
          {data?.didYouMean && (
            <button
              type="button"
              onClick={() => {
                setTerm(data.didYouMean!);
                submit(data.didYouMean!);
              }}
              className="text-xs text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Did you mean <strong>{data.didYouMean}</strong>?
            </button>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </p>
        )}

        {!loading && data?.total === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <p className="text-sm font-medium">Nothing matched “{submitted}”</p>
            <p className="mt-1 text-xs text-zinc-500">
              Try a broader term, or clear the filters on the left.
            </p>
          </div>
        )}

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((item) => (
            <ResultCard key={item.id} item={item} />
          ))}
        </ul>

        {data && data.total > PAGE_SIZE && (
          <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              ← Previous
            </button>
            <span className="text-zinc-500">
              Page {page} of {Math.ceil(data.total / PAGE_SIZE)}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              Next →
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty && !active}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : empty
            ? 'border-zinc-100 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600'
            : 'border-zinc-200 text-zinc-600 hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-300'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1 opacity-60">{count}</span>}
    </button>
  );
}

function ResultCard({ item }: { item: SearchItem }) {
  return (
    <li className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-medium">{item.title}</h3>
      <p className="text-xs text-zinc-500 italic">{item.plant.scientificName}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        <Tag>{SUNLIGHT_LABEL[item.plant.sunlight]}</Tag>
        <Tag>{WATER_LABEL[item.plant.water]}</Tag>
        {item.plant.petFriendly && <Tag>Pet safe</Tag>}
        {item.plant.airPurifying && <Tag>Air purifying</Tag>}
      </div>

      <div className="mt-auto pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold">{rupees(item.price)}</span>
          <span className="text-xs text-zinc-500">
            {item.stock <= 5 ? `Only ${item.stock} left` : 'In stock'}
          </span>
        </div>

        <Link
          href={`/shops/${item.vendor.slug}`}
          className="mt-1 block truncate text-xs text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {item.vendor.name}
          {item.distanceKm !== null && ` · ${item.distanceKm} km`}
        </Link>
      </div>
    </li>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </span>
  );
}
