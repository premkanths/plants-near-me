import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService, type RealtimeIdentity } from './realtime.service';

interface AuthedSocket extends Socket {
  identity?: RealtimeIdentity;
}

/**
 * Realtime fan-out for order updates.
 *
 * Every connection is authenticated at handshake time with a one-shot ticket,
 * and every room join is authorised against the database — a socket cannot
 * simply ask to watch `order:<someone-else's-id>`.
 */
@WebSocketGateway({
  namespace: '/realtime',
  // The web app is served from a different origin (and a different host in the
  // hosted preview), so the browser needs CORS on the websocket endpoint too.
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.registerServer(server);
    this.logger.log('Realtime gateway ready on /realtime');
  }

  handleConnection(client: AuthedSocket): void {
    const ticket =
      (client.handshake.auth?.ticket as string | undefined) ??
      (client.handshake.query?.ticket as string | undefined);

    const identity = this.realtime.redeemTicket(ticket);
    if (!identity) {
      client.emit('unauthorized', { message: 'Invalid or expired realtime ticket' });
      client.disconnect(true);
      return;
    }

    client.identity = identity;

    // Personal room always; vendors also get their shop's room so a new order
    // reaches every device the shop has open.
    void client.join(RealtimeService.userRoom(identity.userId));
    if (identity.vendorId) void client.join(RealtimeService.vendorRoom(identity.vendorId));

    client.emit('ready', { userId: identity.userId, role: identity.role });
  }

  /** Watch one order. Authorised per-socket: the caller must be a party to it. */
  @SubscribeMessage('watchOrder')
  async watchOrder(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { masterOrderId?: string },
  ): Promise<{ watching: boolean; reason?: string }> {
    const identity = client.identity;
    const masterOrderId = body?.masterOrderId;
    if (!identity || !masterOrderId) return { watching: false, reason: 'Missing order id' };

    const allowed = await this.prisma.masterOrder.findFirst({
      where: {
        id: masterOrderId,
        OR: [
          { customerId: identity.userId },
          ...(identity.vendorId
            ? [{ vendorOrders: { some: { vendorId: identity.vendorId } } }]
            : []),
          ...(identity.role === 'ADMIN' ? [{}] : []),
        ],
      },
      select: { id: true },
    });

    if (!allowed) return { watching: false, reason: 'Not your order' };

    await client.join(RealtimeService.orderRoom(masterOrderId));
    return { watching: true };
  }

  @SubscribeMessage('unwatchOrder')
  async unwatchOrder(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { masterOrderId?: string },
  ): Promise<{ watching: boolean }> {
    if (body?.masterOrderId) {
      await client.leave(RealtimeService.orderRoom(body.masterOrderId));
    }
    return { watching: false };
  }
}
