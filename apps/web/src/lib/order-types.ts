export type VendorOrderStatus =
  | 'ORDERED'
  | 'ACCEPTED'
  | 'PACKING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REJECTED';

export interface VendorOrderItem {
  id: string;
  productTitle: string;
  plantName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface VendorOrder {
  id: string;
  orderNumber: string;
  status: VendorOrderStatus;
  itemsTotal: string;
  deliveryFee: string;
  total: string;
  rejectionReason: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  /** Computed server-side from the state machine — the UI never guesses. */
  allowedNext: VendorOrderStatus[];
  vendor: { id: string; name: string };
  masterOrder: {
    id: string;
    orderNumber: string;
    recipientName: string;
    recipientPhone: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    pincode: string;
    notes: string | null;
    placedAt: string;
  };
  items: VendorOrderItem[];
}

export interface VendorOrderStats {
  newOrders: number;
  inProgress: number;
  delivered: number;
  rejected: number;
  revenue: string;
}

/** Wording on the button that performs each transition. */
export const ACTION_LABEL: Record<VendorOrderStatus, string> = {
  ORDERED: 'Reopen',
  ACCEPTED: 'Accept order',
  PACKING: 'Start packing',
  READY_FOR_PICKUP: 'Mark ready',
  OUT_FOR_DELIVERY: 'Send out for delivery',
  DELIVERED: 'Mark delivered',
  REJECTED: 'Reject',
};
