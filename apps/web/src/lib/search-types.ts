export type SearchStrategy = 'exact' | 'fuzzy' | 'browse';

export interface SearchItem {
  id: string;
  title: string;
  description: string | null;
  price: string;
  stock: number;
  potSize: string | null;
  image: string | null;
  score: number;
  plant: {
    id: string;
    commonName: string;
    scientificName: string;
    slug: string;
    sunlight: 'FULL_SUN' | 'PARTIAL_SUN' | 'SHADE';
    water: 'LOW' | 'MEDIUM' | 'HIGH';
    difficulty: 'EASY' | 'MODERATE' | 'HARD';
    placement: 'INDOOR' | 'OUTDOOR' | 'BOTH';
    petFriendly: boolean;
    airPurifying: boolean;
    flowering: boolean;
  };
  vendor: {
    id: string;
    name: string;
    slug: string;
    ratingAvg: number;
    ratingCount: number;
  };
  distanceKm: number | null;
  deliversToYou: boolean | null;
}

export interface SearchFacets {
  placement: { indoor: number; outdoor: number };
  difficulty: { easy: number; moderate: number; hard: number };
  traits: { petFriendly: number; airPurifying: number; flowering: number; lowWater: number };
  price: { min: string | null; max: string | null };
}

export interface SearchResponse {
  items: SearchItem[];
  total: number;
  page: number;
  pageSize: number;
  strategy: SearchStrategy;
  query: string | null;
  didYouMean: string | null;
  facets: SearchFacets;
}

export interface Suggestions {
  plants: { label: string; slug: string }[];
  shops: { label: string; slug: string }[];
}

export const SUNLIGHT_LABEL: Record<string, string> = {
  FULL_SUN: 'Full sun',
  PARTIAL_SUN: 'Partial sun',
  SHADE: 'Shade',
};

export const WATER_LABEL: Record<string, string> = {
  LOW: 'Low water',
  MEDIUM: 'Medium water',
  HIGH: 'Thirsty',
};

export const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: 'Easy care',
  MODERATE: 'Moderate',
  HARD: 'Expert',
};
