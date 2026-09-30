import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CheckoutDto } from './dto/checkout.dto';

/** Row shape returned by the locking SELECT. */
interface LockedProduct {
  id: string;
  vendor_id: string;
  title: string;
  price: string;
  stock: number;
  active: boolean;
  plant_name: string;
  vendor_name: string;
  approved: boolean;
  suspended: boolean;
  delivery_fee: string;
  min_order_value: string;
}

export class CheckoutConflictException extends ConflictException {
  constructor(
    message: string,
    readonly problems: { productId?: string; vendorId?: string; reason: string }[],
  ) {
    super({ message, problems, error: 'Conflict', statusCode: 409 });
  }
}

const money = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Turns a cart into one MasterOrder plus one VendorOrder per shop, atomically.
   *
   * Everything happens inside a single transaction:
   *   1. lock every product row the cart touches (`SELECT … FOR UPDATE`),
   *      ordered by id so two concurrent checkouts can never deadlock;
   *   2. re-validate availability, shop status and per-shop minimums against
   *      the locked rows — the cart preview can be minutes stale;
   *   3. decrement stock with a guarded `UPDATE … WHERE stock >= qty`;
   *   4. write the master order, the vendor orders and the item snapshots;
   *   5. empty the cart.
   *
   * If any step throws, Postgres rolls the whole thing back: no half-placed
   * order, no stock leaked, cart untouched.
   */
  async checkout(userId: string, dto: CheckoutDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId },
          select: {
            id: true,
            items: { select: { productId: true, quantity: true }, orderBy: { addedAt: 'asc' } },
          },
        });

        if (!cart || cart.items.length === 0) {
          throw new BadRequestException('Your cart is empty');
        }

        const quantities = new Map(cart.items.map((item) => [item.productId, item.quantity]));

        // ── 1. Lock the rows we are about to sell ──────────────────
        // Consistent ORDER BY id is what makes concurrent checkouts safe:
        // every transaction takes the same locks in the same sequence.
        const ids = [...quantities.keys()].sort();
        const locked = await tx.$queryRaw<LockedProduct[]>`
          SELECT
            p.id, p.vendor_id, p.title, p.price, p.stock, p.active,
            pl.common_name AS plant_name,
            v.name AS vendor_name, v.approved, v.suspended,
            v.delivery_fee, v.min_order_value
          FROM products p
          JOIN plants pl ON pl.id = p.plant_id
          JOIN vendors v ON v.id = p.vendor_id
          WHERE p.id = ANY(${ids}::uuid[])
          ORDER BY p.id
          FOR UPDATE OF p
        `;

        // ── 2. Validate against the locked truth ───────────────────
        const problems: { productId?: string; vendorId?: string; reason: string }[] = [];
        if (locked.length !== ids.length) {
          problems.push({ reason: 'Some items in your cart no longer exist' });
        }

        for (const product of locked) {
          const quantity = quantities.get(product.id)!;

          if (!product.active) {
            problems.push({
              productId: product.id,
              reason: `${product.title} is no longer listed`,
            });
          } else if (!product.approved || product.suspended) {
            problems.push({
              vendorId: product.vendor_id,
              reason: `${product.vendor_name} is not accepting orders right now`,
            });
          } else if (product.stock < quantity) {
            problems.push({
              productId: product.id,
              reason:
                product.stock === 0
                  ? `${product.title} just sold out`
                  : `Only ${product.stock} left of ${product.title}`,
            });
          }
        }

        // Group by vendor to check per-shop minimums before writing anything.
        const byVendor = new Map<string, { products: LockedProduct[]; subtotal: Prisma.Decimal }>();
        for (const product of locked) {
          const group = byVendor.get(product.vendor_id) ?? { products: [], subtotal: money(0) };
          group.products.push(product);
          group.subtotal = group.subtotal.plus(
            money(product.price).times(quantities.get(product.id)!),
          );
          byVendor.set(product.vendor_id, group);
        }

        for (const [vendorId, group] of byVendor) {
          const minimum = money(group.products[0].min_order_value);
          if (group.subtotal.lessThan(minimum)) {
            problems.push({
              vendorId,
              reason: `${group.products[0].vendor_name} has a ₹${minimum.toFixed(0)} minimum order`,
            });
          }
        }

        if (problems.length > 0) {
          // Throwing rolls back — nothing above this point is persisted.
          throw new CheckoutConflictException(
            'Some items became unavailable while you were shopping',
            problems,
          );
        }

        // ── 3. Reserve stock ───────────────────────────────────────
        for (const product of locked) {
          const quantity = quantities.get(product.id)!;
          const updated = await tx.$executeRaw`
            UPDATE products
            SET stock = stock - ${quantity}, updated_at = NOW()
            WHERE id = ${product.id}::uuid AND stock >= ${quantity}
          `;

          // Belt and braces: the row is locked, so this cannot fail — but if it
          // ever did we would rather abort than oversell.
          if (updated !== 1) {
            throw new CheckoutConflictException('Stock changed while placing your order', [
              { productId: product.id, reason: `${product.title} is no longer available` },
            ]);
          }
        }

        // ── 4. Write the order tree ────────────────────────────────
        const orderNumber = this.orderNumber();
        let itemsTotal = money(0);
        let deliveryTotal = money(0);

        for (const group of byVendor.values()) {
          itemsTotal = itemsTotal.plus(group.subtotal);
          deliveryTotal = deliveryTotal.plus(money(group.products[0].delivery_fee));
        }

        const master = await tx.masterOrder.create({
          data: {
            orderNumber,
            customerId: userId,
            // Payment lands in Step 9; a COD order is placed straight away.
            status: 'PLACED',
            itemsTotal,
            deliveryFee: deliveryTotal,
            grandTotal: itemsTotal.plus(deliveryTotal),
            recipientName: dto.recipientName,
            recipientPhone: dto.recipientPhone,
            addressLine1: dto.addressLine1,
            addressLine2: dto.addressLine2,
            city: dto.city,
            pincode: dto.pincode,
            deliveryLat: dto.deliveryLat,
            deliveryLng: dto.deliveryLng,
            notes: dto.notes,
          },
          select: { id: true, orderNumber: true, placedAt: true },
        });

        let index = 0;
        for (const [vendorId, group] of byVendor) {
          index += 1;
          const deliveryFee = money(group.products[0].delivery_fee);

          await tx.vendorOrder.create({
            data: {
              orderNumber: `${orderNumber}-V${index}`,
              masterOrderId: master.id,
              vendorId,
              status: 'ORDERED',
              itemsTotal: group.subtotal,
              deliveryFee,
              total: group.subtotal.plus(deliveryFee),
              items: {
                create: group.products.map((product) => {
                  const quantity = quantities.get(product.id)!;
                  const unitPrice = money(product.price);
                  return {
                    productId: product.id,
                    // Snapshots: renaming or repricing a listing later must not
                    // rewrite what the customer actually bought.
                    productTitle: product.title,
                    plantName: product.plant_name,
                    unitPrice,
                    quantity,
                    lineTotal: unitPrice.times(quantity),
                  };
                }),
              },
            },
          });
        }

        // ── 5. The cart has become an order ────────────────────────
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        this.logger.log(
          `Order ${orderNumber} placed by ${userId}: ${byVendor.size} vendor order(s), ₹${itemsTotal.plus(deliveryTotal).toFixed(2)}`,
        );

        return this.loadOrder(tx, master.id, userId);
      },
      {
        // Read Committed plus explicit row locks is enough here and avoids the
        // serialization failures a customer would see as random errors.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15_000,
      },
    );
  }

  /** A customer's own order history, newest first. */
  async listForCustomer(userId: string) {
    const orders = await this.prisma.masterOrder.findMany({
      where: { customerId: userId },
      orderBy: { placedAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        grandTotal: true,
        placedAt: true,
        vendorOrders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            vendor: { select: { name: true, slug: true } },
            items: { select: { productTitle: true, quantity: true } },
          },
        },
      },
    });

    return {
      items: orders.map((order) => ({
        ...order,
        grandTotal: order.grandTotal.toFixed(2),
        vendorOrders: order.vendorOrders.map((vendorOrder) => ({
          ...vendorOrder,
          total: vendorOrder.total.toFixed(2),
        })),
      })),
      total: orders.length,
    };
  }

  async getForCustomer(userId: string, orderId: string) {
    const order = await this.loadOrder(this.prisma, orderId, userId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ── helpers ─────────────────────────────────────────────────────

  /** `EP-260930-4F2A9C` — readable on the phone, unique enough to not collide. */
  private orderNumber(): string {
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `EP-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private async loadOrder(
    client: Prisma.TransactionClient | PrismaService,
    orderId: string,
    customerId: string,
  ) {
    // customerId in the WHERE clause: another customer's order id reads as 404.
    const order = await client.masterOrder.findFirst({
      where: { id: orderId, customerId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        itemsTotal: true,
        deliveryFee: true,
        grandTotal: true,
        recipientName: true,
        recipientPhone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        pincode: true,
        notes: true,
        placedAt: true,
        vendorOrders: {
          orderBy: { orderNumber: 'asc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            itemsTotal: true,
            deliveryFee: true,
            total: true,
            vendor: { select: { id: true, name: true, slug: true, phone: true } },
            items: {
              select: {
                id: true,
                productId: true,
                productTitle: true,
                plantName: true,
                unitPrice: true,
                quantity: true,
                lineTotal: true,
              },
            },
          },
        },
      },
    });

    if (!order) return null;

    return {
      ...order,
      itemsTotal: order.itemsTotal.toFixed(2),
      deliveryFee: order.deliveryFee.toFixed(2),
      grandTotal: order.grandTotal.toFixed(2),
      vendorOrders: order.vendorOrders.map((vendorOrder) => ({
        ...vendorOrder,
        itemsTotal: vendorOrder.itemsTotal.toFixed(2),
        deliveryFee: vendorOrder.deliveryFee.toFixed(2),
        total: vendorOrder.total.toFixed(2),
        items: vendorOrder.items.map((item) => ({
          ...item,
          unitPrice: item.unitPrice.toFixed(2),
          lineTotal: item.lineTotal.toFixed(2),
        })),
      })),
    };
  }
}
