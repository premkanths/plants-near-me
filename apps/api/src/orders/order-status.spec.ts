import type { VendorOrderStatus } from '../generated/prisma/enums';
import {
  canTransition,
  deriveMasterStatus,
  isTerminal,
  nextStatuses,
  statusProgress,
  VENDOR_ORDER_TRANSITIONS,
} from './order-status';

const ALL: VendorOrderStatus[] = [
  'ORDERED',
  'ACCEPTED',
  'PACKING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REJECTED',
];

describe('vendor order state machine', () => {
  it('walks the happy path end to end', () => {
    const happyPath: VendorOrderStatus[] = [
      'ORDERED',
      'ACCEPTED',
      'PACKING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];

    for (let i = 0; i < happyPath.length - 1; i += 1) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('refuses to skip a step', () => {
    expect(canTransition('ORDERED', 'OUT_FOR_DELIVERY')).toBe(false);
    expect(canTransition('ACCEPTED', 'DELIVERED')).toBe(false);
    expect(canTransition('PACKING', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('refuses to go backwards', () => {
    expect(canTransition('DELIVERED', 'PACKING')).toBe(false);
    expect(canTransition('OUT_FOR_DELIVERY', 'ACCEPTED')).toBe(false);
    expect(canTransition('PACKING', 'ORDERED')).toBe(false);
  });

  it('allows rejection only before the goods have left the shop', () => {
    expect(canTransition('ORDERED', 'REJECTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'REJECTED')).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'REJECTED')).toBe(false);
    expect(canTransition('DELIVERED', 'REJECTED')).toBe(false);
  });

  it('treats DELIVERED and REJECTED as terminal', () => {
    expect(nextStatuses('DELIVERED')).toEqual([]);
    expect(nextStatuses('REJECTED')).toEqual([]);
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('REJECTED')).toBe(true);
    expect(isTerminal('PACKING')).toBe(false);
  });

  it('never lets a status transition to itself', () => {
    for (const status of ALL) expect(canTransition(status, status)).toBe(false);
  });

  it('covers every status in the transition table', () => {
    expect(Object.keys(VENDOR_ORDER_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it('has no unreachable status', () => {
    const reachable = new Set(Object.values(VENDOR_ORDER_TRANSITIONS).flat());
    for (const status of ALL) {
      if (status === 'ORDERED') continue; // the entry point
      expect(reachable.has(status)).toBe(true);
    }
  });
});

describe('deriveMasterStatus', () => {
  it('stays PLACED while every shop is still working', () => {
    expect(deriveMasterStatus(['ORDERED', 'PACKING'])).toBe('PLACED');
  });

  it('completes when every shop delivered', () => {
    expect(deriveMasterStatus(['DELIVERED', 'DELIVERED'])).toBe('COMPLETED');
  });

  it('cancels when every shop rejected', () => {
    expect(deriveMasterStatus(['REJECTED', 'REJECTED'])).toBe('CANCELLED');
  });

  it('is partially fulfilled on a mixed terminal outcome', () => {
    expect(deriveMasterStatus(['DELIVERED', 'REJECTED'])).toBe('PARTIALLY_FULFILLED');
  });

  it('is partially fulfilled while one shop is done and another is in flight', () => {
    expect(deriveMasterStatus(['DELIVERED', 'PACKING'])).toBe('PARTIALLY_FULFILLED');
    expect(deriveMasterStatus(['REJECTED', 'ACCEPTED'])).toBe('PARTIALLY_FULFILLED');
  });

  it('leaves an unpaid order alone', () => {
    expect(deriveMasterStatus(['DELIVERED'], 'PENDING_PAYMENT')).toBe('PENDING_PAYMENT');
  });

  it('keeps the current status when there are no vendor orders', () => {
    expect(deriveMasterStatus([], 'PLACED')).toBe('PLACED');
  });
});

describe('statusProgress', () => {
  it('runs from 0 to 1 along the happy path', () => {
    expect(statusProgress('ORDERED')).toBe(0);
    expect(statusProgress('DELIVERED')).toBe(1);
    expect(statusProgress('PACKING')).toBeCloseTo(0.4);
  });

  it('shows a rejected order as finished', () => {
    expect(statusProgress('REJECTED')).toBe(1);
  });
});
