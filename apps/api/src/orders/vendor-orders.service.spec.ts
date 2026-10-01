import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { VendorOrdersService } from './vendor-orders.service';

/**
 * These tests pin the three things a status change must get right: the machine
 * rejects illegal moves, a rejection returns stock, and the master status is
 * recomputed from the siblings — all inside one transaction.
 */
describe('VendorOrdersService', () => {
  let service: VendorOrdersService;
  let tx: {
    $queryRaw: jest.Mock;
    orderItem: { findMany: jest.Mock };
    product: { update: jest.Mock };
    vendorOrder: { update: jest.Mock; findMany: jest.Mock };
    masterOrder: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    payment: { updateMany: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock; vendorOrder: Record<string, jest.Mock> };
  let realtime: { emit: jest.Mock; emitToMany: jest.Mock };

  const VENDOR = 'vendor-1';
  const ORDER = 'order-1';

  const updated = (status: string) => ({
    id: ORDER,
    orderNumber: 'EP-260930-ABCDEF-V1',
    status,
    itemsTotal: { toFixed: () => '420.00' },
    deliveryFee: { toFixed: () => '49.00' },
    total: { toFixed: () => '469.00' },
    rejectionReason: null,
    vendor: { id: VENDOR, name: 'Lalbagh Greens' },
    items: [],
  });

  /** Puts the locked row in a given state and wires the rest of the happy path. */
  const atStatus = (status: string, siblings: string[] = [status]) => {
    tx.$queryRaw.mockResolvedValue([
      { id: ORDER, status, vendor_id: VENDOR, master_order_id: 'master-1' },
    ]);
    tx.vendorOrder.findMany.mockResolvedValue(siblings.map((s) => ({ status: s })));
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn(),
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      product: { update: jest.fn() },
      vendorOrder: {
        update: jest.fn().mockImplementation(({ data }) => updated(data.status)),
        findMany: jest.fn().mockResolvedValue([]),
      },
      masterOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          status: 'PLACED',
          customerId: 'customer-1',
          deliveryLat: 12.97,
          deliveryLng: 77.59,
        }),
        update: jest.fn(),
      },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      vendorOrder: { findMany: jest.fn(), findFirst: jest.fn(), groupBy: jest.fn() },
    };
    realtime = { emit: jest.fn(), emitToMany: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VendorOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(VendorOrdersService);
  });

  describe('guards', () => {
    it('404s on an unknown order', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to let one shop touch another shop’s order', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: ORDER, status: 'ORDERED', vendor_id: 'someone-else', master_order_id: 'master-1' },
      ]);

      await expect(service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.vendorOrder.update).not.toHaveBeenCalled();
    });

    it('locks the row FOR UPDATE before deciding anything', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });

      const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join(' ? ');
      expect(sql).toContain('FOR UPDATE');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.vendorOrder.update.mock.invocationCallOrder[0],
      );
    });

    it('does all of it in a single transaction', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('legal moves', () => {
    it('accepts an order and stamps acceptedAt', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });

      expect(tx.vendorOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACCEPTED', acceptedAt: expect.any(Date) }),
        }),
      );
    });

    it('stamps deliveredAt on delivery', async () => {
      atStatus('OUT_FOR_DELIVERY');
      await service.updateStatus(VENDOR, ORDER, { status: 'DELIVERED' });

      expect(tx.vendorOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DELIVERED', deliveredAt: expect.any(Date) }),
        }),
      );
    });

    it('returns the moves the UI may offer next', async () => {
      atStatus('ORDERED');
      const result = await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });
      expect(result.allowedNext).toEqual(['PACKING', 'REJECTED']);
    });
  });

  describe('illegal moves', () => {
    it('rejects a skipped step', async () => {
      atStatus('ORDERED');
      await expect(
        service.updateStatus(VENDOR, ORDER, { status: 'OUT_FOR_DELIVERY' }),
      ).rejects.toThrow(BadRequestException);
      expect(tx.vendorOrder.update).not.toHaveBeenCalled();
    });

    it('rejects going backwards', async () => {
      atStatus('DELIVERED');
      await expect(service.updateStatus(VENDOR, ORDER, { status: 'PACKING' })).rejects.toThrow(
        /Cannot go from/,
      );
    });

    it('rejects re-applying the current status', async () => {
      atStatus('PACKING');
      await expect(service.updateStatus(VENDOR, ORDER, { status: 'PACKING' })).rejects.toThrow(
        /already/,
      );
    });

    it('explains that a finished order cannot move', async () => {
      atStatus('DELIVERED');
      await expect(service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' })).rejects.toThrow(
        /this order is finished/,
      );
    });

    it('emits nothing when the move is refused', async () => {
      atStatus('ORDERED');
      await expect(service.updateStatus(VENDOR, ORDER, { status: 'DELIVERED' })).rejects.toThrow();
      expect(realtime.emitToMany).not.toHaveBeenCalled();
    });
  });

  describe('rejection', () => {
    it('demands a reason', async () => {
      atStatus('ORDERED');
      await expect(service.updateStatus(VENDOR, ORDER, { status: 'REJECTED' })).rejects.toThrow(
        /why you are rejecting/,
      );
      await expect(
        service.updateStatus(VENDOR, ORDER, { status: 'REJECTED', reason: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('puts the stock back on the shelf', async () => {
      atStatus('ORDERED');
      tx.orderItem.findMany.mockResolvedValue([
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 3 },
      ]);

      await service.updateStatus(VENDOR, ORDER, { status: 'REJECTED', reason: 'Out of stock' });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: 2 } },
      });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: { stock: { increment: 3 } },
      });
    });

    it('does not touch stock on an ordinary advance', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });

  describe('master status', () => {
    it('completes the master order once every shop delivered', async () => {
      atStatus('OUT_FOR_DELIVERY', ['DELIVERED', 'DELIVERED']);
      await service.updateStatus(VENDOR, ORDER, { status: 'DELIVERED' });

      expect(tx.masterOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'COMPLETED' } }),
      );
    });

    it('marks it partially fulfilled when one shop rejected', async () => {
      atStatus('ORDERED', ['REJECTED', 'DELIVERED']);
      await service.updateStatus(VENDOR, ORDER, { status: 'REJECTED', reason: 'Closed' });

      expect(tx.masterOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PARTIALLY_FULFILLED' } }),
      );
    });

    it('settles the cash-on-delivery payment once the order completes', async () => {
      atStatus('OUT_FOR_DELIVERY', ['DELIVERED', 'DELIVERED']);
      await service.updateStatus(VENDOR, ORDER, { status: 'DELIVERED' });

      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ provider: 'COD', status: 'PENDING' }),
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('marks the payment failed when every shop rejects', async () => {
      atStatus('ORDERED', ['REJECTED', 'REJECTED']);
      await service.updateStatus(VENDOR, ORDER, { status: 'REJECTED', reason: 'Closed' });

      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('leaves the master alone while shops are still working', async () => {
      atStatus('ORDERED', ['ACCEPTED', 'ORDERED']);
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });
      expect(tx.masterOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('realtime', () => {
    it('sends one emit covering every interested room, never one per room', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });
      expect(realtime.emitToMany).toHaveBeenCalledTimes(1);
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('notifies the order room, the customer and the shop', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });

      const [rooms, event, payload] = realtime.emitToMany.mock.calls[0];
      expect(rooms).toEqual(['order:master-1', 'user:customer-1', 'vendor:vendor-1']);
      expect(event).toBe('order.status');
      expect(payload).toMatchObject({
        status: 'ACCEPTED',
        previousStatus: 'ORDERED',
        statusLabel: 'Accepted',
        masterStatus: 'PLACED',
      });
    });

    it('emits only after the write, never before', async () => {
      atStatus('ORDERED');
      await service.updateStatus(VENDOR, ORDER, { status: 'ACCEPTED' });

      expect(tx.vendorOrder.update.mock.invocationCallOrder[0]).toBeLessThan(
        realtime.emitToMany.mock.invocationCallOrder[0],
      );
    });
  });
});
