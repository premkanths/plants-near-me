import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Server } from 'socket.io';
import type { Role } from '../generated/prisma/enums';

export interface RealtimeIdentity {
  userId: string;
  role: Role;
  vendorId?: string;
}

interface Ticket extends RealtimeIdentity {
  expiresAt: number;
}

/** Short enough that a leaked ticket is worthless, long enough to survive a slow page load. */
const TICKET_TTL_MS = 60_000;

/**
 * Socket authentication without handing a JWT to browser JavaScript.
 *
 * The web app's access token lives in an httpOnly cookie on its own origin, so
 * client-side code cannot read it — and the API is a different origin, so the
 * cookie is not sent there either. Instead the browser asks its own backend for
 * a single-use, 60-second **ticket**, and presents that in the socket
 * handshake. Worst case, a stolen ticket is one minute of read-only access to
 * rooms the user could already see.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly tickets = new Map<string, Ticket>();
  private server?: Server;

  registerServer(server: Server): void {
    this.server = server;
  }

  issueTicket(identity: RealtimeIdentity): { ticket: string; expiresIn: number } {
    this.sweep();
    const ticket = randomBytes(24).toString('base64url');
    this.tickets.set(ticket, { ...identity, expiresAt: Date.now() + TICKET_TTL_MS });
    return { ticket, expiresIn: Math.floor(TICKET_TTL_MS / 1000) };
  }

  /** Single use: redeeming removes it, so a replayed handshake fails. */
  redeemTicket(ticket: string | undefined): RealtimeIdentity | null {
    if (!ticket) return null;

    const found = this.tickets.get(ticket);
    if (!found) return null;

    this.tickets.delete(ticket);
    if (found.expiresAt < Date.now()) return null;

    return { userId: found.userId, role: found.role, vendorId: found.vendorId };
  }

  // ── room naming ────────────────────────────────────────────────
  static userRoom = (userId: string) => `user:${userId}`;
  static vendorRoom = (vendorId: string) => `vendor:${vendorId}`;
  static orderRoom = (masterOrderId: string) => `order:${masterOrderId}`;

  /**
   * Emits to a room. Deliberately fire-and-forget: realtime is a nicety layered
   * on top of the database, never the source of truth. A dropped socket must
   * never fail the HTTP request that caused the change.
   */
  emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`No socket server yet — dropping ${event}`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }

  /**
   * Emits to several rooms at once.
   *
   * Passing the whole list to `to()` in one call matters: a socket that is in
   * two of the rooms (the customer is in both their personal room and the
   * order room) gets exactly one copy. Emitting room by room would deliver
   * duplicates.
   */
  emitToMany(rooms: string[], event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`No socket server yet — dropping ${event}`);
      return;
    }
    this.server.to([...new Set(rooms)]).emit(event, payload);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, ticket] of this.tickets) {
      if (ticket.expiresAt < now) this.tickets.delete(key);
    }
  }
}
