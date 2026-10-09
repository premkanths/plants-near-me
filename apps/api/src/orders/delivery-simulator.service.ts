import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

/** Demo pacing: a ~45 s "ride" with a position ping every 3 s. */
const TICK_MS = 3_000;
const TICKS = 15;

interface Point {
  lat: number;
  lng: number;
}

/**
 * Stand-in for a real driver app.
 *
 * In production a courier's phone would post GPS fixes and a queue worker would
 * close the order out. For the demo we interpolate a straight line from the
 * shop to the delivery address, emit it over the same socket channel a real
 * driver would use, and mark the order delivered at the end — so the customer
 * UI is exercised end to end without any extra infrastructure.
 */
@Injectable()
export class DeliverySimulatorService implements OnModuleDestroy {
  private readonly logger = new Logger(DeliverySimulatorService.name);
  private readonly running = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Returns true if a run was started. Never throws into the request path. */
  async start(vendorOrderId: string, onArrival: () => Promise<unknown>): Promise<boolean> {
    if (this.running.has(vendorOrderId)) return false;

    const order = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      select: {
        orderNumber: true,
        masterOrderId: true,
        vendor: { select: { latitude: true, longitude: true } },
        masterOrder: { select: { customerId: true, deliveryLat: true, deliveryLng: true } },
      },
    });
    if (!order) return false;

    const from: Point = { lat: order.vendor.latitude, lng: order.vendor.longitude };
    const to: Point = {
      lat: order.masterOrder.deliveryLat ?? from.lat,
      lng: order.masterOrder.deliveryLng ?? from.lng,
    };
    const rooms = [
      RealtimeService.orderRoom(order.masterOrderId),
      RealtimeService.userRoom(order.masterOrder.customerId),
    ];

    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      const progress = Math.min(tick / TICKS, 1);

      this.realtime.emitToMany(rooms, 'delivery.position', {
        vendorOrderId,
        orderNumber: order.orderNumber,
        masterOrderId: order.masterOrderId,
        progress,
        position: {
          lat: from.lat + (to.lat - from.lat) * progress,
          lng: from.lng + (to.lng - from.lng) * progress,
        },
        etaSeconds: Math.round(((TICKS - tick) * TICK_MS) / 1000),
      });

      if (progress >= 1) {
        this.stop(vendorOrderId);
        void onArrival().catch((error: unknown) => {
          // The vendor may have finished the order by hand mid-ride; that is a
          // legitimate race, not a crash.
          this.logger.warn(
            `Auto-delivery for ${order.orderNumber} skipped: ${(error as Error).message}`,
          );
        });
      }
    }, TICK_MS);

    // Do not hold the event loop open for a demo timer.
    timer.unref?.();
    this.running.set(vendorOrderId, timer);
    this.logger.log(`Simulated driver dispatched for ${order.orderNumber}`);
    return true;
  }

  stop(vendorOrderId: string): void {
    const timer = this.running.get(vendorOrderId);
    if (timer) clearInterval(timer);
    this.running.delete(vendorOrderId);
  }

  onModuleDestroy(): void {
    for (const id of [...this.running.keys()]) this.stop(id);
  }
}
