'use client';

import 'leaflet/dist/leaflet.css';
import { DivIcon } from 'leaflet';
import { useEffect, useMemo } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { Coordinates, NearbyVendor } from '@/lib/discovery-types';
import { distanceLabel } from '@/lib/discovery-types';
import { rupees } from '@/lib/vendor-types';

/**
 * Leaflet's default marker images are loaded from a CDN path that breaks under
 * bundlers, so every pin here is an inline SVG DivIcon — no external assets,
 * and the selected/unreachable states are just CSS.
 */
function pin(color: string, scale = 1): DivIcon {
  const size = 32 * scale;
  return new DivIcon({
    className: 'eplant-pin',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <path d="M12 22s7-6.3 7-12A7 7 0 0 0 5 10c0 5.7 7 12 7 12Z" fill="${color}" stroke="white" stroke-width="1.6"/>
        <circle cx="12" cy="10" r="2.6" fill="white"/>
      </svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 6],
  });
}

const youIcon = new DivIcon({
  className: 'eplant-pin',
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#2563eb;
           border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,.25)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Keeps the viewport in sync when the origin or radius changes. */
function Recenter({ origin, radiusKm }: { origin: Coordinates; radiusKm: number }) {
  const map = useMap();

  useEffect(() => {
    const zoom = radiusKm <= 2 ? 14 : radiusKm <= 6 ? 13 : radiusKm <= 15 ? 12 : 11;
    map.setView([origin.lat, origin.lng], zoom, { animate: true });
  }, [map, origin.lat, origin.lng, radiusKm]);

  return null;
}

/** Click anywhere to move the search origin — the quickest way to explore. */
function ClickToMove({ onPick }: { onPick: (point: Coordinates) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

interface Props {
  origin: Coordinates;
  radiusKm: number;
  vendors: NearbyVendor[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPick: (point: Coordinates) => void;
}

export default function VendorMap({
  origin,
  radiusKm,
  vendors,
  selectedId,
  onSelect,
  onPick,
}: Props) {
  const icons = useMemo(
    () => ({
      selected: pin('#047857', 1.35),
      delivers: pin('#10b981'),
      far: pin('#94a3b8'),
    }),
    [],
  );

  return (
    <MapContainer
      center={[origin.lat, origin.lng]}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: '#e5e7eb' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <Recenter origin={origin} radiusKm={radiusKm} />
      <ClickToMove onPick={onPick} />

      {/* The search radius, drawn in metres so it stays true at any zoom. */}
      <Circle
        center={[origin.lat, origin.lng]}
        radius={radiusKm * 1000}
        pathOptions={{ color: '#10b981', weight: 1.5, fillColor: '#10b981', fillOpacity: 0.07 }}
      />

      <Marker position={[origin.lat, origin.lng]} icon={youIcon} zIndexOffset={1000}>
        <Popup>You are here</Popup>
      </Marker>

      {vendors.map((vendor) => (
        <Marker
          key={vendor.id}
          position={[vendor.latitude, vendor.longitude]}
          icon={
            vendor.id === selectedId
              ? icons.selected
              : vendor.deliversToYou
                ? icons.delivers
                : icons.far
          }
          zIndexOffset={vendor.id === selectedId ? 900 : 0}
          eventHandlers={{ click: () => onSelect(vendor.id) }}
        >
          <Popup>
            <strong className="block text-sm">{vendor.name}</strong>
            <span className="text-xs text-zinc-500">
              {distanceLabel(vendor.distanceKm)} away · {vendor.productCount} plants
              {vendor.startingPrice ? ` · from ${rupees(vendor.startingPrice)}` : ''}
            </span>
            <br />
            <a href={`/shops/${vendor.slug}`} className="text-xs font-medium text-emerald-700">
              Visit shop →
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
