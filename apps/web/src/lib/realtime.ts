import { io, type Socket } from 'socket.io-client';
import { api } from './api-client';

export interface OrderStatusEvent {
  vendorOrderId: string;
  orderNumber: string;
  masterOrderId: string;
  status: string;
  previousStatus: string;
  statusLabel: string;
  masterStatus: string;
  vendorName: string;
  rejectionReason: string | null;
  at: string;
}

export interface OrderCreatedEvent {
  vendorOrderId: string;
  orderNumber: string;
  masterOrderId: string;
  total: string;
  itemCount: number;
  at: string;
}

export interface DeliveryPositionEvent {
  vendorOrderId: string;
  orderNumber: string;
  masterOrderId: string;
  progress: number;
  position: { lat: number; lng: number };
  etaSeconds: number;
}

/**
 * Where the websocket lives.
 *
 * HTTP goes through the same-origin `/api` BFF proxy, but a Next.js route
 * handler cannot proxy a websocket upgrade, so the socket talks to the API
 * directly. Locally that is port 3001; in the hosted preview each port gets its
 * own hostname (`https://3000-…` → `https://3001-…`), so the default is derived
 * from the page's own origin and `NEXT_PUBLIC_API_WS_URL` overrides it in any
 * deployment where the two do not line up.
 */
export function realtimeOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_WS_URL;
  if (configured) return configured;
  if (typeof window === 'undefined') return 'http://localhost:3001';

  const { origin, protocol, hostname, port } = window.location;
  if (port === '3000') return `${protocol}//${hostname}:3001`;
  if (hostname.startsWith('3000-')) return origin.replace('3000-', '3001-');

  return origin;
}

/**
 * Opens an authenticated socket.
 *
 * The access token is httpOnly and belongs to the web origin, so it cannot be
 * put in the handshake. Instead the BFF mints a single-use 60-second ticket
 * that the API redeems — the browser never sees a JWT.
 */
export async function connectRealtime(): Promise<Socket> {
  const { ticket } = await api.post<{ ticket: string }>('/api/realtime/ticket', {});

  return io(`${realtimeOrigin()}/realtime`, {
    transports: ['websocket', 'polling'],
    auth: { ticket },
    forceNew: true,
    reconnection: false, // a ticket is single use; we re-mint one instead
  });
}
