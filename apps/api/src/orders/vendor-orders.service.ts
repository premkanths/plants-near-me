import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { VendorOrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { UpdateOrderStatusDto } from './dto/order-status.dto';
import { canTransition, deriveMasterStatus, nextStatuses, STATUS_LABEL } from './order-status';

@Injectable()
export class VendorOrdersService {
  private readonly logger = new Logger(VendorOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * An order that has not been paid for yet is not the shop's problem, so
   * everything here filters out master orders still in PENDING_PAYMENT.
   */
  private readonly paidOnly = { masterOrder: { status: { not: 'PENDING_PAYMENT' as const } } };

  /** Incoming orders for one shop, newest first. */
  async list(vendorId: string, status?: VendorOrderStatus) {
    const orders = await this.prisma.vendorOrder.findMany({
      where: { vendorId, ...this.paidOnly, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: this.selection(),
    });

    return { items: orders.map((order) => this.present(order)), total: orders.length };
  }

  /** Counts for the dashboard tiles — one grouped query, not seven. */
  async stats(vendorId: string) {
    const grouped = await this.prisma.vendorOrder.groupBy({
      by: ['status'],
      where: { vendorId, ...this.paidOnly },
      _count: { _all: true },
      _sum: { total: true },
    });

    const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
    const revenue = grouped
      .filter((row) => row.status === 'DELIVERED')
      .reduce((sum, row) => sum.plus(row._sum.total ?? 0), new Prisma.Decimal(0));

    return {
      newOrders: counts.ORDERED ?? 0,
      inProgress:
        (counts.ACCEPTED ?? 0) +
        (counts.PACKING ?? 0) +
        (counts.READY_FOR_PICKUP ?? 0) +
        (counts.OUT_FOR_DELIVERY ?? 0),
      delivered: counts.DELIVERED ?? 0,
      rejected: counts.REJECTED ?? 0,
      revenue: revenue.toFixed(2),
    };
  }

  async getOne(vendorId: string, id: string) {
    const order = await this.prisma.vendorOrder.findFirst({
      where: { id, vendorId, ...this.paidOnly },
      select: this.selection(),
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.present(order);
  }

  /**
   * Moves one vendor order along the state machine.
   *
   * The transaction covers three things that must agree with each other:
   * the vendor order's own status, the stock returned by a rejection, and the
   * master order status derived from all its siblings.
   */
  async updateStatus(vendorId: string, id: string, dto: UpdateOrderStatusDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Locked so two dashboard tabs cannot both advance the same order.
      const [current] = await tx.$queryRaw<
        { id: string; status: VendorOrderStatus; vendor_id: string; master_order_id: string }[]
      >`
        SELECT id, status, vendor_id, master_order_id
        FROM vendor_orders WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      if (!current) throw new NotFoundException('Order not found');
      // Ownership is checked after loading so a foreign id cannot be probed by
      // timing, but before anything is written.
      if (current.vendor_id !== vendorId) {
        throw new ForbiddenException('That order belongs to another shop');
      }

      if (current.status === dto.status) {
        throw new BadRequestException(`Order is already ${STATUS_LABEL[dto.status]}`);
      }
      if (!canTransition(current.status, dto.status)) {
        throw new BadRequestException(
          `Cannot go from ${STATUS_LABEL[current.status]} to ${STATUS_LABEL[dto.status]}. ` +
            `Allowed: ${
              nextStatuses(current.status)
                .map((s) => STATUS_LABEL[s])
                .join(', ') || 'nothing, this order is finished'
            }`,
        );
      }
      if (dto.status === 'REJECTED' && !dto.reason?.trim()) {
        throw new BadRequestException('Tell the customer why you are rejecting the order');
      }

      // Rejecting puts the plants back on the shelf — otherwise stock reserved
      // at checkout would be lost forever.
      let restocked = 0;
      if (dto.status === 'REJECTED') {
        const items = await tx.orderItem.findMany({
          where: { vendorOrderId: id },
          select: { productId: true, quantity: true },
        });

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        restocked = items.length;
      }

      const updated = await tx.vendorOrder.update({
        where: { id },
        data: {
          status: dto.status,
          rejectionReason: dto.status === 'REJECTED' ? dto.reason?.trim() : null,
          acceptedAt: dto.status === 'ACCEPTED' ? new Date() : undefined,
          deliveredAt: dto.status === 'DELIVERED' ? new Date() : undefined,
        },
        select: this.selection(),
      });

      // The master status is derived, never stored independently.
      const siblings = await tx.vendorOrder.findMany({
        where: { masterOrderId: current.master_order_id },
        select: { status: true },
      });
      const master = await tx.masterOrder.findUniqueOrThrow({
        where: { id: current.master_order_id },
        select: { status: true, customerId: true, deliveryLat: true, deliveryLng: true },
      });

      if (master.status === 'PENDING_PAYMENT') {
        throw new BadRequestException('This order has not been paid for yet');
      }

      const masterStatus = deriveMasterStatus(
        siblings.map((sibling) => sibling.status),
        master.status,
      );

      if (masterStatus !== master.status) {
        await tx.masterOrder.update({
          where: { id: current.master_order_id },
          data: { status: masterStatus },
        });

        // Cash is collected at the door, so a COD order settles the moment the
        // last shop has delivered. Online orders were already paid up front.
        if (masterStatus === 'COMPLETED' || masterStatus === 'PARTIALLY_FULFILLED') {
          await tx.payment.updateMany({
            where: { masterOrderId: current.master_order_id, provider: 'COD', status: 'PENDING' },
            data: { status: 'PAID', paidAt: new Date() },
          });
        }
        if (masterStatus === 'CANCELLED') {
          await tx.payment.updateMany({
            where: { masterOrderId: current.master_order_id, status: 'PENDING' },
            data: { status: 'FAILED', failureReason: 'Every shop rejected the order' },
          });
        }
      }

      return {
        order: updated,
        previous: current.status,
        masterOrderId: current.master_order_id,
        masterStatus,
        customerId: master.customerId,
        restocked,
        destination:
          master.deliveryLat && master.deliveryLng
            ? { lat: master.deliveryLat, lng: master.deliveryLng }
            : null,
      };
    });

    const payload = {
      vendorOrderId: result.order.id,
      orderNumber: result.order.orderNumber,
      masterOrderId: result.masterOrderId,
      status: result.order.status,
      previousStatus: result.previous,
      statusLabel: STATUS_LABEL[result.order.status],
      masterStatus: result.masterStatus,
      vendorName: result.order.vendor.name,
      rejectionReason: result.order.rejectionReason,
      at: new Date().toISOString(),
    };

    // Emitted after commit: subscribers never see a state the database does not
    // already hold.
    this.realtime.emitToMany(
      [
        RealtimeService.orderRoom(result.masterOrderId),
        RealtimeService.userRoom(result.customerId),
        RealtimeService.vendorRoom(vendorId),
      ],
      'order.status',
      payload,
    );

    this.logger.log(
      `${result.order.orderNumber}: ${result.previous} → ${result.order.status}` +
        (result.restocked ? ` (restocked ${result.restocked} line(s))` : ''),
    );

    return { ...this.present(result.order), masterStatus: result.masterStatus };
  }

  private selection() {
    return {
      id: true,
      orderNumber: true,
      status: true,
      itemsTotal: true,
      deliveryFee: true,
      total: true,
      rejectionReason: true,
      acceptedAt: true,
      deliveredAt: true,
      createdAt: true,
      vendor: { select: { id: true, name: true, latitude: true, longitude: true } },
      masterOrder: {
        select: {
          id: true,
          orderNumber: true,
          recipientName: true,
          recipientPhone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          pincode: true,
          notes: true,
          placedAt: true,
          deliveryLat: true,
          deliveryLng: true,
        },
      },
      items: {
        select: {
          id: true,
          productTitle: true,
          plantName: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
        },
      },
    } satisfies Prisma.VendorOrderSelect;
  }

  private present(
    order: Prisma.VendorOrderGetPayload<{ select: ReturnType<VendorOrdersService['selection']> }>,
  ) {
    return {
      ...order,
      itemsTotal: order.itemsTotal.toFixed(2),
      deliveryFee: order.deliveryFee.toFixed(2),
      total: order.total.toFixed(2),
      allowedNext: nextStatuses(order.status),
      items: order.items.map((item) => ({
        ...item,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
    };
  }
}
