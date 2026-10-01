export interface CartLine {
  id: string;
  productId: string;
  title: string;
  plantName: string;
  scientificName: string;
  potSize: string | null;
  image: string | null;
  /** Money is a fixed-precision string everywhere — never a float. */
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  stock: number;
}

export interface CartVendorGroup {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  lines: CartLine[];
  subtotal: string;
  deliveryFee: string;
  total: string;
  minOrderValue: string;
  belowMinimum: boolean;
  shopClosed: boolean;
}

export interface CartIssue {
  code:
    'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'UNAVAILABLE' | 'SHOP_UNAVAILABLE' | 'BELOW_MIN_ORDER';
  message: string;
  productId?: string;
  vendorId?: string;
  blocking: boolean;
}

export interface Cart {
  vendorGroups: CartVendorGroup[];
  itemCount: number;
  lineCount: number;
  itemsTotal: string;
  deliveryTotal: string;
  grandTotal: string;
  issues: CartIssue[];
  checkoutReady: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  productTitle: string;
  plantName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface VendorOrder {
  id: string;
  orderNumber: string;
  status:
    | 'ORDERED'
    | 'ACCEPTED'
    | 'PACKING'
    | 'READY_FOR_PICKUP'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'REJECTED';
  itemsTotal: string;
  deliveryFee: string;
  total: string;
  rejectionReason: string | null;
  deliveredAt: string | null;
  vendor: { id: string; name: string; slug: string; phone: string | null };
  items: OrderItem[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'PENDING_PAYMENT' | 'PLACED' | 'PARTIALLY_FULFILLED' | 'COMPLETED' | 'CANCELLED';
  itemsTotal: string;
  deliveryFee: string;
  grandTotal: string;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  pincode: string;
  notes: string | null;
  placedAt: string;
  payment: {
    provider: 'RAZORPAY' | 'COD';
    status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
    amount: string;
    paidAt: string | null;
  } | null;
  vendorOrders: VendorOrder[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: Order['status'];
  grandTotal: string;
  placedAt: string;
  vendorOrders: {
    id: string;
    orderNumber: string;
    status: VendorOrder['status'];
    total: string;
    vendor: { name: string; slug: string };
    items: { productTitle: string; quantity: number }[];
  }[];
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Placed',
  PARTIALLY_FULFILLED: 'Partly delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ORDERED: 'Sent to shop',
  ACCEPTED: 'Accepted',
  PACKING: 'Being packed',
  READY_FOR_PICKUP: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
};

export const STATUS_TONE: Record<string, string> = {
  PLACED: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  ORDERED: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  ACCEPTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  DELIVERED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  CANCELLED: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};
