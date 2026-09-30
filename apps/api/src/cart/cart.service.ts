import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_LINE_QUANTITY } from './dto/cart.dto';

/** One blocking or advisory problem with a cart line or vendor group. */
export interface CartIssue {
  code:
    'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'UNAVAILABLE' | 'SHOP_UNAVAILABLE' | 'BELOW_MIN_ORDER';
  message: string;
  productId?: string;
  vendorId?: string;
  /** Advisory issues let checkout proceed; blocking ones do not. */
  blocking: boolean;
}

const money = (value: Prisma.Decimal | number | string): Prisma.Decimal =>
  new Prisma.Decimal(value);

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The cart is always returned grouped by vendor, because that is how it will
   * be split at checkout: the customer should see the same shape they will be
   * charged for (per-shop subtotal, per-shop delivery fee, per-shop minimum).
   */
  async getCart(userId: string) {
    const cart = await this.ensureCart(userId);

    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { addedAt: 'asc' },
      select: {
        id: true,
        quantity: true,
        addedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            price: true,
            stock: true,
            active: true,
            potSize: true,
            images: true,
            plant: { select: { commonName: true, scientificName: true, imageUrl: true } },
            vendor: {
              select: {
                id: true,
                name: true,
                slug: true,
                deliveryFee: true,
                minOrderValue: true,
                approved: true,
                suspended: true,
              },
            },
          },
        },
      },
    });

    return this.summarise(items);
  }

  async addItem(userId: string, productId: string, quantity: number) {
    const cart = await this.ensureCart(userId);
    const product = await this.loadSellableProduct(productId);

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
      select: { quantity: true },
    });

    // Adding the same plant twice tops up the line rather than erroring.
    const desired = (existing?.quantity ?? 0) + quantity;
    if (desired > MAX_LINE_QUANTITY) {
      throw new BadRequestException(`You can order at most ${MAX_LINE_QUANTITY} of one listing`);
    }
    if (desired > product.stock) {
      throw new BadRequestException(
        `Only ${product.stock} left of ${product.title}${existing ? ` (you already have ${existing.quantity} in the cart)` : ''}`,
      );
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: desired },
    });

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const cart = await this.ensureCart(userId);

    // Scoped by cartId so one customer can never touch another's line.
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      select: { productId: true },
    });
    if (!item) throw new NotFoundException('That item is not in your cart');

    const product = await this.loadSellableProduct(item.productId);
    if (quantity > product.stock) {
      throw new BadRequestException(`Only ${product.stock} left of ${product.title}`);
    }

    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.ensureCart(userId);

    const { count } = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });
    if (count === 0) throw new NotFoundException('That item is not in your cart');

    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.ensureCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  /** Every customer has exactly one cart; create it lazily on first use. */
  async ensureCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
  }

  private async loadSellableProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        stock: true,
        active: true,
        vendor: { select: { approved: true, suspended: true, name: true } },
      },
    });

    if (!product || !product.active) throw new NotFoundException('That plant is no longer listed');
    if (!product.vendor.approved || product.vendor.suspended) {
      throw new BadRequestException(`${product.vendor.name} is not accepting orders right now`);
    }
    if (product.stock < 1) throw new BadRequestException(`${product.title} is out of stock`);

    return product;
  }

  /**
   * Builds the vendor groups and totals. Pure arithmetic over rows already
   * loaded — kept separate so it can be unit-tested without a database.
   */
  private summarise(
    items: {
      id: string;
      quantity: number;
      product: {
        id: string;
        title: string;
        price: Prisma.Decimal;
        stock: number;
        active: boolean;
        potSize: string | null;
        images: string[];
        plant: { commonName: string; scientificName: string; imageUrl: string | null };
        vendor: {
          id: string;
          name: string;
          slug: string;
          deliveryFee: Prisma.Decimal;
          minOrderValue: Prisma.Decimal;
          approved: boolean;
          suspended: boolean;
        };
      };
    }[],
  ) {
    const groups = new Map<
      string,
      {
        vendor: (typeof items)[number]['product']['vendor'];
        lines: ReturnType<CartService['toLine']>[];
        subtotal: Prisma.Decimal;
      }
    >();

    const issues: CartIssue[] = [];

    for (const item of items) {
      const { vendor } = item.product;
      const group = groups.get(vendor.id) ?? { vendor, lines: [], subtotal: money(0) };

      const line = this.toLine(item);
      group.lines.push(line);
      group.subtotal = group.subtotal.plus(line.lineTotal);
      groups.set(vendor.id, group);

      if (!item.product.active) {
        issues.push({
          code: 'UNAVAILABLE',
          message: `${item.product.title} is no longer available`,
          productId: item.product.id,
          blocking: true,
        });
      } else if (item.product.stock === 0) {
        issues.push({
          code: 'OUT_OF_STOCK',
          message: `${item.product.title} is out of stock`,
          productId: item.product.id,
          blocking: true,
        });
      } else if (item.product.stock < item.quantity) {
        issues.push({
          code: 'INSUFFICIENT_STOCK',
          message: `Only ${item.product.stock} left of ${item.product.title} — reduce the quantity`,
          productId: item.product.id,
          blocking: true,
        });
      }
    }

    let itemsTotal = money(0);
    let deliveryTotal = money(0);

    const vendorGroups = [...groups.values()].map((group) => {
      const shopClosed = !group.vendor.approved || group.vendor.suspended;
      const belowMinimum = group.subtotal.lessThan(group.vendor.minOrderValue);

      if (shopClosed) {
        issues.push({
          code: 'SHOP_UNAVAILABLE',
          message: `${group.vendor.name} is not accepting orders right now`,
          vendorId: group.vendor.id,
          blocking: true,
        });
      } else if (belowMinimum) {
        issues.push({
          code: 'BELOW_MIN_ORDER',
          message: `${group.vendor.name} has a ₹${group.vendor.minOrderValue.toString()} minimum — add ₹${group.vendor.minOrderValue.minus(group.subtotal).toString()} more`,
          vendorId: group.vendor.id,
          blocking: true,
        });
      }

      const deliveryFee = money(group.vendor.deliveryFee);
      itemsTotal = itemsTotal.plus(group.subtotal);
      deliveryTotal = deliveryTotal.plus(deliveryFee);

      return {
        vendorId: group.vendor.id,
        vendorName: group.vendor.name,
        vendorSlug: group.vendor.slug,
        lines: group.lines,
        subtotal: group.subtotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        total: group.subtotal.plus(deliveryFee).toFixed(2),
        minOrderValue: group.vendor.minOrderValue.toFixed(2),
        belowMinimum,
        shopClosed,
      };
    });

    return {
      vendorGroups,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      lineCount: items.length,
      /** One delivery fee per shop: that is what a multi-vendor order really costs. */
      itemsTotal: itemsTotal.toFixed(2),
      deliveryTotal: deliveryTotal.toFixed(2),
      grandTotal: itemsTotal.plus(deliveryTotal).toFixed(2),
      issues,
      checkoutReady: items.length > 0 && issues.every((issue) => !issue.blocking),
    };
  }

  private toLine(item: {
    id: string;
    quantity: number;
    product: {
      id: string;
      title: string;
      price: Prisma.Decimal;
      stock: number;
      potSize: string | null;
      images: string[];
      plant: { commonName: string; scientificName: string; imageUrl: string | null };
    };
  }) {
    const unitPrice = money(item.product.price);
    return {
      id: item.id,
      productId: item.product.id,
      title: item.product.title,
      plantName: item.product.plant.commonName,
      scientificName: item.product.plant.scientificName,
      potSize: item.product.potSize,
      image: item.product.images?.[0] ?? item.product.plant.imageUrl ?? null,
      unitPrice: unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: unitPrice.times(item.quantity).toFixed(2),
      stock: item.product.stock,
    };
  }
}
