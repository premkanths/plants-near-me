import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CheckoutDto } from './dto/checkout.dto';
import { CheckoutConflictException, OrdersService } from './orders.service';

/**
 * The checkout transaction is the riskiest code in the project, so these tests
 * assert the *mechanism*: row locks in a deterministic order, a guarded stock
 * decrement, and an exception (i.e. a rollback) rather than a partial write
 * whenever anything is off.
 */
describe('OrdersService', () => {
  let service: OrdersService;
  let tx: {
    cart: { findUnique: jest.Mock };
    cartItem: { deleteMany: jest.Mock };
    masterOrder: { create: jest.Mock; findFirst: jest.Mock };
    vendorOrder: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let prisma: { $transaction: jest.Mock; masterOrder: { findFirst: jest.Mock } };

  const sqlOf = (call: unknown[]): string => (call[0] as string[]).join(' ? ');

  /** Jest records a global call counter, which is enough to assert ordering. */
  const firstCallOrder = (mock: jest.Mock): number => mock.mock.invocationCallOrder[0];
  const ranBefore = (first: jest.Mock, second: jest.Mock) =>
    expect(firstCallOrder(first)).toBeLessThan(firstCallOrder(second));

  const lockedRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'product-1',
    vendor_id: 'vendor-1',
    title: 'Money Plant',
    price: '240.00',
    stock: 10,
    active: true,
    plant_name: 'Money Plant',
    vendor_name: 'Lalbagh',
    approved: true,
    suspended: false,
    delivery_fee: '49.00',
    min_order_value: '0.00',
    ...overrides,
  });

  const dto: CheckoutDto = {
    recipientName: 'Anitha Rao',
    recipientPhone: '9800000101',
    addressLine1: '42 4th Cross',
    city: 'Bengaluru',
    pincode: '560034',
    paymentMethod: 'COD',
  };

  const withCart = (items: { productId: string; quantity: number }[]) =>
    tx.cart.findUnique.mockResolvedValue({ id: 'cart-1', items });

  beforeEach(async () => {
    tx = {
      cart: { findUnique: jest.fn() },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      masterOrder: {
        create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'EP-260930-ABCDEF' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vendorOrder: { create: jest.fn().mockResolvedValue({ id: 'vo-1' }) },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    prisma = {
      // Run the callback inline so assertions see every call it makes.
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      masterOrder: { findFirst: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: { emit: jest.fn(), emitToMany: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('atomicity', () => {
    it('does everything inside one transaction', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow()]);

      await service.checkout('user-1', dto);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('locks the product rows FOR UPDATE before touching stock', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow()]);

      await service.checkout('user-1', dto);

      const lockSql = sqlOf(tx.$queryRaw.mock.calls[0]);
      expect(lockSql).toContain('FOR UPDATE');
      ranBefore(tx.$queryRaw, tx.$executeRaw);
    });

    it('takes locks in a deterministic id order so concurrent checkouts cannot deadlock', async () => {
      withCart([
        { productId: 'ccc', quantity: 1 },
        { productId: 'aaa', quantity: 1 },
        { productId: 'bbb', quantity: 1 },
      ]);
      tx.$queryRaw.mockResolvedValue([
        lockedRow({ id: 'aaa' }),
        lockedRow({ id: 'bbb' }),
        lockedRow({ id: 'ccc' }),
      ]);

      await service.checkout('user-1', dto);

      const ids = tx.$queryRaw.mock.calls[0][1] as string[];
      expect(ids).toEqual(['aaa', 'bbb', 'ccc']);
      expect(sqlOf(tx.$queryRaw.mock.calls[0])).toContain('ORDER BY p.id');
    });

    it('decrements stock with a guard so it can never go negative', async () => {
      withCart([{ productId: 'product-1', quantity: 3 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow({ stock: 5 })]);

      await service.checkout('user-1', dto);

      const updateSql = sqlOf(tx.$executeRaw.mock.calls[0]);
      expect(updateSql).toContain('SET stock = stock -');
      expect(updateSql).toContain('stock >=');
    });

    it('aborts if the guarded update somehow affects no row', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow()]);
      tx.$executeRaw.mockResolvedValue(0);

      await expect(service.checkout('user-1', dto)).rejects.toBeInstanceOf(
        CheckoutConflictException,
      );
      expect(tx.masterOrder.create).not.toHaveBeenCalled();
    });

    it('empties the cart only after the order tree is written', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow()]);

      await service.checkout('user-1', dto);

      ranBefore(tx.vendorOrder.create, tx.cartItem.deleteMany);
    });
  });

  describe('rollback conditions', () => {
    const expectAbort = async () => {
      await expect(service.checkout('user-1', dto)).rejects.toBeInstanceOf(
        CheckoutConflictException,
      );
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.masterOrder.create).not.toHaveBeenCalled();
      expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
    };

    it('aborts when stock ran out between browsing and paying', async () => {
      withCart([{ productId: 'product-1', quantity: 4 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow({ stock: 2 })]);
      await expectAbort();
    });

    it('aborts when a product was de-listed', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow({ active: false })]);
      await expectAbort();
    });

    it('aborts when the shop was suspended', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow({ suspended: true })]);
      await expectAbort();
    });

    it('aborts when a product vanished entirely', async () => {
      withCart([
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ]);
      tx.$queryRaw.mockResolvedValue([lockedRow()]); // only one row came back
      await expectAbort();
    });

    it('aborts when a vendor group is under its minimum order value', async () => {
      withCart([{ productId: 'product-1', quantity: 1 }]);
      tx.$queryRaw.mockResolvedValue([lockedRow({ price: '100.00', min_order_value: '500.00' })]);
      await expectAbort();
    });

    it('reports every problem at once instead of one per retry', async () => {
      withCart([
        { productId: 'product-1', quantity: 9 },
        { productId: 'product-2', quantity: 9 },
      ]);
      tx.$queryRaw.mockResolvedValue([
        lockedRow({ id: 'product-1', stock: 1 }),
        lockedRow({ id: 'product-2', stock: 0, title: 'Tulsi' }),
      ]);

      await expect(service.checkout('user-1', dto)).rejects.toMatchObject({
        response: {
          problems: expect.arrayContaining([
            expect.objectContaining({ reason: expect.any(String) }),
          ]),
        },
      });

      const error = await service
        .checkout('user-1', dto)
        .catch((e: CheckoutConflictException) => e);
      expect((error as CheckoutConflictException).problems).toHaveLength(2);
    });

    it('rejects an empty cart before taking any lock', async () => {
      withCart([]);

      await expect(service.checkout('user-1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('the split itself', () => {
    beforeEach(() => {
      withCart([
        { productId: 'product-1', quantity: 2 },
        { productId: 'product-2', quantity: 1 },
      ]);
      tx.$queryRaw.mockResolvedValue([
        lockedRow({
          id: 'product-1',
          price: '100.00',
          vendor_id: 'vendor-1',
          delivery_fee: '49.00',
        }),
        lockedRow({
          id: 'product-2',
          price: '220.00',
          vendor_id: 'vendor-2',
          vendor_name: 'Indiranagar',
          delivery_fee: '59.00',
        }),
      ]);
    });

    it('creates one vendor order per shop under a single master order', async () => {
      await service.checkout('user-1', dto);

      expect(tx.masterOrder.create).toHaveBeenCalledTimes(1);
      expect(tx.vendorOrder.create).toHaveBeenCalledTimes(2);
    });

    it('totals the master order as the sum of its vendor orders', async () => {
      await service.checkout('user-1', dto);

      const master = tx.masterOrder.create.mock.calls[0][0].data;
      expect(master.itemsTotal.toFixed(2)).toBe('420.00'); // 2×100 + 1×220
      expect(master.deliveryFee.toFixed(2)).toBe('108.00'); // 49 + 59
      expect(master.grandTotal.toFixed(2)).toBe('528.00');
    });

    it('numbers vendor orders as children of the master number', async () => {
      await service.checkout('user-1', dto);

      const numbers = tx.vendorOrder.create.mock.calls.map((call) => call[0].data.orderNumber);
      expect(numbers[0]).toMatch(/^EP-\d{6}-[0-9A-F]{6}-V1$/);
      expect(numbers[1]).toMatch(/-V2$/);
      expect(numbers[0].slice(0, -3)).toBe(numbers[1].slice(0, -3));
    });

    it('snapshots title, plant name and unit price onto each item', async () => {
      await service.checkout('user-1', dto);

      const item = tx.vendorOrder.create.mock.calls[0][0].data.items.create[0];
      expect(item).toMatchObject({
        productTitle: expect.any(String),
        plantName: expect.any(String),
        quantity: expect.any(Number),
      });
      expect(item.unitPrice.toFixed(2)).toBe('100.00');
      expect(item.lineTotal.toFixed(2)).toBe('200.00');
    });

    it('starts each vendor order at ORDERED and the master at PLACED', async () => {
      await service.checkout('user-1', dto);

      expect(tx.masterOrder.create.mock.calls[0][0].data.status).toBe('PLACED');
      expect(tx.vendorOrder.create.mock.calls[0][0].data.status).toBe('ORDERED');
    });

    it('snapshots the delivery address onto the order', async () => {
      await service.checkout('user-1', dto);

      expect(tx.masterOrder.create.mock.calls[0][0].data).toMatchObject({
        recipientName: 'Anitha Rao',
        addressLine1: '42 4th Cross',
        pincode: '560034',
      });
    });
  });

  describe('reading orders', () => {
    it('scopes a single order read to the requesting customer', async () => {
      prisma.masterOrder.findFirst.mockResolvedValue(null);

      await expect(service.getForCustomer('user-1', 'order-9')).rejects.toThrow('Order not found');
      expect(prisma.masterOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-9', customerId: 'user-1' } }),
      );
    });
  });
});
