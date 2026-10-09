export interface Coordinates {
  lat: number;
  lng: number;
}

export interface NearbyVendor {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  addressLine: string | null;
  city: string;
  pincode: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  deliversToYou: boolean;
  deliveryRadiusKm: number;
  /** Money arrives as a string (Prisma Decimal) — format with rupees(). */
  deliveryFee: string;
  minOrderValue: string;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
  startingPrice: string | null;
  categories: string[];
  preview: { id: string; title: string; price: string; image: string | null }[];
}

export interface NearbyProduct {
  id: string;
  title: string;
  price: string;
  stock: number;
  potSize: string | null;
  image: string | null;
  plant: { id: string; commonName: string; scientificName: string };
  vendor: {
    id: string;
    name: string;
    slug: string;
    latitude: number;
    longitude: number;
    deliveryFee: string;
  };
  distanceKm: number;
  deliversToYou: boolean;
}

export interface NearbyResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  radiusKm: number;
  origin: Coordinates;
}

export interface ShopDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  addressLine: string | null;
  city: string;
  state: string;
  pincode: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  deliveryRadiusKm: number;
  deliveryFee: string;
  minOrderValue: string;
  ratingAvg: number;
  ratingCount: number;
  categories: string[];
  distanceKm: number | null;
  deliversToYou: boolean | null;
  products: {
    id: string;
    title: string;
    price: string;
    stock: number;
    potSize: string | null;
    images: string[];
    ratingAvg: number;
    ratingCount: number;
    plant: { id: string; commonName: string; scientificName: string; slug: string };
  }[];
}

/**
 * Fallback pins so the page is useful before the visitor shares their location
 * (and on desktops where geolocation is often refused).
 */
export const LANDMARKS: { label: string; lat: number; lng: number }[] = [
  { label: 'MG Road', lat: 12.9758, lng: 77.6045 },
  { label: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { label: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
  { label: 'Jayanagar', lat: 12.9299, lng: 77.5826 },
  { label: 'Whitefield', lat: 12.9698, lng: 77.75 },
  { label: 'Hebbal', lat: 13.0358, lng: 77.597 },
];

export const DEFAULT_ORIGIN: Coordinates = { lat: LANDMARKS[0].lat, lng: LANDMARKS[0].lng };

export const distanceLabel = (km: number): string =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
