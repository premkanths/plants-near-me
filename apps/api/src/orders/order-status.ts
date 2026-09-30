import type { MasterOrderStatus, VendorOrderStatus } from '../generated/prisma/enums';

/**
 * The lifecycle of one shop's slice of an order.
 *
 *   ORDERED ──accept──▶ ACCEPTED ──▶ PACKING ──▶ READY_FOR_PICKUP
 *      │                                              │
 *      └──reject──▶ REJECTED (terminal)               ▼
 *                                          OUT_FOR_DELIVERY ──▶ DELIVERED (terminal)
 *
 * Keeping this as data rather than a pile of `if`s means the API, the tests and
 * the UI all read the same table — the buttons a vendor sees are generated from
 * `nextStatuses`, so they can never offer an illegal move.
 */
export const VENDOR_ORDER_TRANSITIONS: Record<VendorOrderStatus, VendorOrderStatus[]> = {
  ORDERED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PACKING', 'REJECTED'],
  PACKING: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  REJECTED: [],
};

export const TERMINAL_STATUSES: VendorOrderStatus[] = ['DELIVERED', 'REJECTED'];

/** Human wording used in notifications and the UI. */
export const STATUS_LABEL: Record<VendorOrderStatus, string> = {
  ORDERED: 'Sent to shop',
  ACCEPTED: 'Accepted',
  PACKING: 'Being packed',
  READY_FOR_PICKUP: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
};

export const isTerminal = (status: VendorOrderStatus): boolean =>
  TERMINAL_STATUSES.includes(status);

export const canTransition = (from: VendorOrderStatus, to: VendorOrderStatus): boolean =>
  VENDOR_ORDER_TRANSITIONS[from].includes(to);

export const nextStatuses = (from: VendorOrderStatus): VendorOrderStatus[] =>
  VENDOR_ORDER_TRANSITIONS[from];

/**
 * The master order has no status of its own — it is a pure function of its
 * vendor orders. Deriving it (rather than storing a second source of truth that
 * can drift) is why a partially rejected order reports correctly without any
 * bookkeeping.
 */
export function deriveMasterStatus(
  vendorStatuses: VendorOrderStatus[],
  current: MasterOrderStatus = 'PLACED',
): MasterOrderStatus {
  if (current === 'PENDING_PAYMENT' || vendorStatuses.length === 0) return current;

  const allTerminal = vendorStatuses.every(isTerminal);
  const anyDelivered = vendorStatuses.includes('DELIVERED');
  const anyRejected = vendorStatuses.includes('REJECTED');

  if (allTerminal) {
    if (!anyDelivered) return 'CANCELLED'; // every shop said no
    return anyRejected ? 'PARTIALLY_FULFILLED' : 'COMPLETED';
  }

  // Still in flight somewhere: partially fulfilled only once something landed.
  return anyDelivered || anyRejected ? 'PARTIALLY_FULFILLED' : 'PLACED';
}

/** Progress 0–1 for the customer's tracker; rejected slices show as complete. */
export function statusProgress(status: VendorOrderStatus): number {
  const order: VendorOrderStatus[] = [
    'ORDERED',
    'ACCEPTED',
    'PACKING',
    'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ];
  if (status === 'REJECTED') return 1;
  return order.indexOf(status) / (order.length - 1);
}
