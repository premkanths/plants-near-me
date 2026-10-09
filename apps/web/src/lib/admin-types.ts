export interface AdminOverview {
  users: { total: number; customers: number; vendors: number; admins: number };
  vendors: { total: number; approved: number; pending: number; suspended: number };
  catalogue: { activeProducts: number };
  orders: { total: number; byStatus: Record<string, number> };
  /** Fixed-point string — only paid money counts. */
  revenue: string;
  reviews: number;
}

export interface AdminAnalytics {
  days: number;
  daily: { day: string; orders: number; revenue: number }[];
  topVendors: { id: string; name: string; slug: string; orders: number; revenue: number }[];
  vendorOrderStatus: { status: string; count: number }[];
  topPlants: { plantName: string; quantity: number }[];
}

export interface AdminVendorRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  approved: boolean;
  suspended: boolean;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  user: { id: string; email: string; name: string; isActive: boolean };
  productCount: number;
  orderCount: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'VENDOR' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
  vendor: { id: string; name: string; slug: string } | null;
  orderCount: number;
  reviewCount: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const EXPORT_DATASETS = ['orders', 'vendors', 'users', 'products'] as const;
