'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import {
  DEFAULT_ORIGIN,
  distanceLabel,
  LANDMARKS,
  type Coordinates,
  type NearbyResponse,
  type NearbyVendor,
} from '@/lib/discovery-types';
import { rupees } from '@/lib/vendor-types';

/** Leaflet touches `window` on import, so the map is client-only. */
const VendorMap = dynamic(() => import('./VendorMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-900">
      Loading map…
    </div>
  ),
});

type Sort = 'distance' | 'rating' | 'name';

const CATEGORIES = [
  { slug: '', label: 'All shops' },
  { slug: 'nursery', label: 'Nurseries' },
  { slug: 'flower-shop', label: 'Flower shops' },
  { slug: 'gardening-store', label: 'Gardening stores' },
];

const round5 = (value: number) => Math.round(value * 1e5) / 1e5;

export function NearbyExplorer({ initialOrigin }: { initialOrigin?: Coordinates }) {
  const [origin, setOrigin] = useState<Coordinates>(initialOrigin ?? DEFAULT_ORIGIN);
  const [originLabel, setOriginLabel] = useState(initialOrigin ? 'Chosen location' : 'MG Road');
  const [radiusKm, setRadiusKm] = useState(5);
  const [deliverableOnly, setDeliverableOnly] = useState(false);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('distance');

  const [vendors, setVendors] = useState<NearbyVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const requestId = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      lat: String(round5(origin.lat)),
      lng: String(round5(origin.lng)),
      radiusKm: String(radiusKm),
      sort,
      pageSize: '50',
    });
    if (deliverableOnly) params.set('deliverableOnly', 'true');
    if (category) params.set('category', category);
    return params.toString();
  }, [origin.lat, origin.lng, radiusKm, sort, deliverableOnly, category]);

  useEffect(() => {
    // A slider drag fires many changes — debounce so PostGIS is hit once.
    const id = requestId.current + 1;
    requestId.current = id;

    const timer = setTimeout(() => {
      setLoading(true);
      api
        .get<NearbyResponse<NearbyVendor>>(`/api/nearby/vendors?${query}`)
        .then((data) => {
          if (requestId.current !== id) return; // a newer request already won
          setVendors(data.items);
          setTotal(data.total);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (requestId.current !== id) return;
          setError(cause instanceof ApiError ? cause.message : 'Could not load nearby nurseries');
          setVendors([]);
          setTotal(0);
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This browser cannot share your location — pick a landmark instead');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setOriginLabel('Your location');
        setLocating(false);
      },
      () => {
        setError('Location permission denied — pick a landmark or tap the map');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const pickOnMap = useCallback((point: Coordinates) => {
    setOrigin(point);
    setOriginLabel('Dropped pin');
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* ── Controls + results ───────────────────────────────── */}
      <div className="order-2 flex flex-col gap-4 lg:order-1">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-wider text-zinc-400 uppercase">Searching from</p>
              <p className="text-sm font-medium">{originLabel}</p>
            </div>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
            >
              {locating ? 'Locating…' : '📍 Use my location'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {LANDMARKS.map((place) => (
              <button
                key={place.label}
                type="button"
                onClick={() => {
                  setOrigin({ lat: place.lat, lng: place.lng });
                  setOriginLabel(place.label);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  originLabel === place.label
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-zinc-200 text-zinc-600 hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-300'
                }`}
              >
                {place.label}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Within {radiusKm} km
            <input
              type="range"
              min={0.5}
              max={25}
              step={0.5}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
              className="mt-1 w-full accent-emerald-600"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {CATEGORIES.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="distance">Nearest first</option>
              <option value="rating">Best rated</option>
              <option value="name">A–Z</option>
            </select>

            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={deliverableOnly}
                onChange={(event) => setDeliverableOnly(event.target.checked)}
                className="accent-emerald-600"
              />
              Delivers to me
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-zinc-500">
            {loading ? 'Searching…' : `${total} ${total === 1 ? 'nursery' : 'nurseries'} found`}
          </span>
          <span className="text-xs text-zinc-400">Tap the map to move the pin</span>
        </div>

        {error && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </p>
        )}

        {!loading && !error && vendors.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <p className="text-sm font-medium">No nurseries within {radiusKm} km</p>
            <p className="mt-1 text-xs text-zinc-500">
              Widen the radius or pick another neighbourhood.
            </p>
            <button
              type="button"
              onClick={() => setRadiusKm(Math.min(25, radiusKm * 2))}
              className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Search {Math.min(25, radiusKm * 2)} km instead
            </button>
          </div>
        )}

        <ul className="flex max-h-[30rem] flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[34rem]">
          {vendors.map((vendor) => (
            <li
              key={vendor.id}
              ref={(node) => {
                if (node) cardRefs.current.set(vendor.id, node);
                else cardRefs.current.delete(vendor.id);
              }}
              onMouseEnter={() => setSelectedId(vendor.id)}
              onClick={() => select(vendor.id)}
              className={`cursor-pointer rounded-2xl border bg-white p-4 transition dark:bg-zinc-900 ${
                selectedId === vendor.id
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-zinc-200 hover:border-emerald-300 dark:border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{vendor.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {vendor.addressLine ?? vendor.city}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {distanceLabel(vendor.distanceKm)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>
                  {vendor.ratingCount > 0
                    ? `★ ${vendor.ratingAvg.toFixed(1)} (${vendor.ratingCount})`
                    : 'New shop'}
                </span>
                <span>{vendor.productCount} plants</span>
                {vendor.startingPrice && <span>from {rupees(vendor.startingPrice)}</span>}
                <span
                  className={
                    vendor.deliversToYou
                      ? 'font-medium text-emerald-600'
                      : 'font-medium text-zinc-400'
                  }
                >
                  {vendor.deliversToYou
                    ? `Delivers · ${Number(vendor.deliveryFee) === 0 ? 'free' : rupees(vendor.deliveryFee)}`
                    : 'Pickup only'}
                </span>
              </div>

              {vendor.preview.length > 0 && (
                <p className="mt-2 truncate text-xs text-zinc-400">
                  {vendor.preview.map((item) => item.title).join(' · ')}
                </p>
              )}

              <Link
                href={`/shops/${vendor.slug}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Visit shop →
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Map ──────────────────────────────────────────────── */}
      <div className="order-1 h-[22rem] overflow-hidden rounded-2xl border border-zinc-200 lg:sticky lg:top-6 lg:order-2 lg:h-[46rem] dark:border-zinc-800">
        <VendorMap
          origin={origin}
          radiusKm={radiusKm}
          vendors={vendors}
          selectedId={selectedId}
          onSelect={select}
          onPick={pickOnMap}
        />
      </div>
    </div>
  );
}
