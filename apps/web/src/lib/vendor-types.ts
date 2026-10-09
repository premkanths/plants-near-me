export interface PlantSummary {
  id: string;
  commonName: string;
  scientificName: string;
  slug: string;
  sunlight: 'FULL_SUN' | 'PARTIAL_SUN' | 'SHADE';
  water: 'LOW' | 'MEDIUM' | 'HIGH';
  difficulty: 'EASY' | 'MODERATE' | 'HARD';
  placement: 'INDOOR' | 'OUTDOOR' | 'BOTH';
  imageUrl: string | null;
}

export interface VendorProduct {
  id: string;
  vendorId: string;
  plantId: string;
  title: string;
  description: string | null;
  /** Decimal serialised as a string by the API — never parse money with floats casually. */
  price: string;
  stock: number;
  potSize: string | null;
  images: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  plant: Pick<PlantSummary, 'id' | 'commonName' | 'scientificName' | 'slug' | 'imageUrl'>;
}

export interface ProductListResponse {
  items: VendorProduct[];
  total: number;
  take: number;
  skip: number;
}

export interface InventoryStats {
  total: number;
  active: number;
  outOfStock: number;
  lowStock: number;
  inventoryValue: number;
}

export interface VendorProfile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string;
  state: string;
  pincode: string | null;
  latitude: number;
  longitude: number;
  deliveryRadiusKm: number;
  deliveryFee: string;
  minOrderValue: string;
  ratingAvg: number;
  ratingCount: number;
  approved: boolean;
  approvedAt: string | null;
  suspended: boolean;
  createdAt: string;
}

export const rupees = (value: string | number): string =>
  `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
