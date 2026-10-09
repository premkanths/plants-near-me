import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

const vendor = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'vendor-1',
  name: 'Lalbagh Green Nursery',
  slug: 'lalbagh',
  deliveryFee: decimal('49.00'),
  minOrderValue: decimal('0.00'),
  approved: true,
  suspended: false,
  ...overrides,
});

const cartItem = (overrides: {
  id?: string;
  quantity?: number;
  price?: string;
  stock?: number;
  active?: boolean;
  vendor?: ReturnType<typeof vendor>;
  productId?: string;
  title?: string;
}) => ({
  id: overrides.id ?? 'item-1',
  quantity: overrides.quantity ?? 1,
  addedAt: new Date(),
  product: {
    id: overrides.productId ?? 'product-1',
    title: overrides.title ?? 'Money Plant (8 inch pot)',
    price: decimal(overrides.price ?? '240.00'),
    stock: overrides.stock ?? 10,
    active: overrides.active ?? true,
    potSize: '8 inch',
    images: [],
    plant: { commonName: 'Money Plant', scientificName: 'Epipremnum aureum', imageUrl: null },
    vendor: overrides.vendor ?? vendor(),
  },
});

describe('CartService', () => {
  let service: CartService;
  let prisma: {
    cart: { upsert: jest.Mock };
    cartItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    product: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }) },
      cartItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CartService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CartService);
  });

  describe('grouping and totals', () => {
    it('groups lines by vendor and charges one delivery fee per shop', async () => {
      prisma.cartItem.findMany.mockResolvedValue([
        cartItem({ id: 'a', price: '100.00', quantity: 2 }),
        cartItem({
          id: 'b',
          productId: 'product-2',
          price: '220.00',
          quantity: 1,
          vendor: vendor({ id: 'vendor-2', name: 'Indiranagar', deliveryFee: decimal('59.00') }),
        }),
      ]);

      const cart = await service.getCart('user-1');

      expect(cart.vendorGroups).toHaveLength(2);
      expect(cart.itemsTotal).toBe('420.00');
      expect(cart.deliveryTotal).toBe('108.00'); // 49 + 59, not one shared fee
      expect(cart.grandTotal).toBe('528.00');
    });

    it('counts units, not lines', async () => {
      prisma.cartItem.findMany.mockResolvedValue([
        cartItem({ id: 'a', quantity: 3 }),
        cartItem({ id: 'b', productId: 'product-2', quantity: 2 }),
      ]);

      const cart = await service.getCart('user-1');

      expect(cart.itemCount).toBe(5);
      expect(cart.lineCount).toBe(2);
    });

    it('keeps money as fixed-precision strings', async () => {
      prisma.cartItem.findMany.mockResolvedValue([cartItem({ price: '0.10', quantity: 3 })]);

      const cart = await service.getCart('user-1');

      // 0.1 * 3 in floating point is 0.30000000000000004 — Decimal avoids that.
      expect(cart.itemsTotal).toBe('0.30');
      expect(typeof cart.grandTotal).toBe('string');
    });

    it('is checkout-ready only when it has lines and no blocking issue', async () => {
      const empty = await service.getCart('user-1');
      expect(empty.checkoutReady).toBe(false);

      prisma.cartItem.findMany.mockResolvedValue([cartItem({})]);
      const ready = await service.getCart('user-1');
      expect(ready.checkoutReady).toBe(true);
    });
  });

  describe('issues surfaced before checkout', () => {
    it('flags a line whose stock dropped below the requested quantity', async () => {
      prisma.cartItem.findMany.mockResolvedValue([cartItem({ quantity: 5, stock: 2 })]);

      const cart = await service.getCart('user-1');

      expect(cart.issues).toContainEqual(
        expect.objectContaining({ code: 'INSUFFICIENT_STOCK', blocking: true }),
      );
      expect(cart.checkoutReady).toBe(false);
    });

    it('flags a sold-out line distinctly from a partially stocked one', async () => {
      prisma.cartItem.findMany.mockResolvedValue([cartItem({ quantity: 1, stock: 0 })]);

      const cart = await service.getCart('user-1');
      expect(cart.issues[0].code).toBe('OUT_OF_STOCK');
    });

    it('flags a de-listed product', async () => {
      prisma.cartItem.findMany.mockResolvedValue([cartItem({ active: false })]);

      const cart = await service.getCart('user-1');
      expect(cart.issues[0].code).toBe('UNAVAILABLE');
    });

    it('flags a suspended shop', async () => {
      prisma.cartItem.findMany.mockResolvedValue([
        cartItem({ vendor: vendor({ suspended: true }) }),
      ]);

      const cart = await service.getCart('user-1');
      expect(cart.issues).toContainEqual(
        expect.objectContaining({ code: 'SHOP_UNAVAILABLE', blocking: true }),
      );
    });

    it('flags a vendor group under its minimum order value', async () => {
      prisma.cartItem.findMany.mockResolvedValue([
        cartItem({ price: '100.00', quantity: 1, vendor: vendor({ minOrderValue: decimal(500) }) }),
      ]);

      const cart = await service.getCart('user-1');

      expect(cart.vendorGroups[0].belowMinimum).toBe(true);
      expect(cart.issues[0].code).toBe('BELOW_MIN_ORDER');
      expect(cart.checkoutReady).toBe(false);
    });
  });

  describe('adding items', () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-1',
        title: 'Money Plant',
        stock: 5,
        active: true,
        vendor: { approved: true, suspended: false, name: 'Lalbagh' },
      });
    });

    it('tops up an existing line instead of failing', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({ quantity: 2 });

      await service.addItem('user-1', 'product-1', 1);

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: 3 } }),
      );
    });

    it('refuses to put more in the cart than the shop has', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({ quantity: 4 });

      await expect(service.addItem('user-1', 'product-1', 3)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('refuses an unlisted product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-1',
        title: 'Money Plant',
        stock: 5,
        active: false,
        vendor: { approved: true, suspended: false, name: 'Lalbagh' },
      });

      await expect(service.addItem('user-1', 'product-1', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a product from an unapproved shop', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-1',
        title: 'Money Plant',
        stock: 5,
        active: true,
        vendor: { approved: false, suspended: false, name: 'Hebbal' },
      });

      await expect(service.addItem('user-1', 'product-1', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('ownership', () => {
    it('scopes an update to the caller’s own cart', async () => {
      prisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(service.updateItem('user-1', 'item-9', 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-9', cartId: 'cart-1' } }),
      );
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('scopes a delete to the caller’s own cart', async () => {
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeItem('user-1', 'item-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { id: 'item-9', cartId: 'cart-1' },
      });
    });
  });
});
