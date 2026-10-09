import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: {
    $transaction: jest.Mock;
    vendorOrder: { findFirst: jest.Mock; findMany: jest.Mock };
    review: { findUnique: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    vendor: { findUnique: jest.Mock };
  };
  let tx: {
    review: { create: jest.Mock; update: jest.Mock; delete: jest.Mock; aggregate: jest.Mock };
    vendor: { update: jest.Mock };
    product: { update: jest.Mock };
  };

  const USER = 'user-1';
  const VENDOR_ORDER = 'vo-1';

  const delivered = (overrides: Record<string, unknown> = {}) => ({
    id: VENDOR_ORDER,
    status: 'DELIVERED',
    vendorId: 'vendor-1',
    masterOrder: { customerId: USER },
    items: [{ productId: 'product-1' }],
    ...overrides,
  });

  const dto = { vendorOrderId: VENDOR_ORDER, rating: 5, comment: 'Healthy plants' };

  beforeEach(async () => {
    tx = {
      review: {
        create: jest.fn().mockResolvedValue({ id: 'review-1', rating: 5 }),
        update: jest.fn().mockResolvedValue({ id: 'review-1', rating: 3 }),
        delete: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 2 } }),
      },
      vendor: { update: jest.fn() },
      product: { update: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      vendorOrder: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      review: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vendor: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ReviewsService);
  });

  describe('who may review', () => {
    it('refuses an order that does not exist', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(null);
      await expect(service.create(USER, dto)).rejects.toThrow(NotFoundException);
    });

    it('refuses someone else’s order, and says 404 rather than 403', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(
        delivered({ masterOrder: { customerId: 'someone-else' } }),
      );
      await expect(service.create(USER, dto)).rejects.toThrow(NotFoundException);
      expect(tx.review.create).not.toHaveBeenCalled();
    });

    it('refuses an order that has not been delivered', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered({ status: 'OUT_FOR_DELIVERY' }));
      await expect(service.create(USER, dto)).rejects.toThrow(/has been delivered/);
    });

    it('refuses a rejected order', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered({ status: 'REJECTED' }));
      await expect(service.create(USER, dto)).rejects.toThrow(BadRequestException);
    });

    it('accepts a delivered order from the buyer', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      await expect(service.create(USER, dto)).resolves.toMatchObject({ id: 'review-1' });
    });
  });

  describe('product reviews', () => {
    it('refuses a plant that was not in the box', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      await expect(service.create(USER, { ...dto, productId: 'not-bought' })).rejects.toThrow(
        /not part of this order/,
      );
    });

    it('updates the listing’s rating when the review names a plant', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      await service.create(USER, { ...dto, productId: 'product-1' });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { ratingAvg: 4.5, ratingCount: 2 },
      });
    });

    it('leaves listing ratings alone for a shop-level review', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      await service.create(USER, dto);
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });

  describe('one review per order', () => {
    it('turns the unique-index violation into a 409', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      tx.review.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '7',
        }),
      );

      await expect(service.create(USER, dto)).rejects.toThrow(ConflictException);
    });

    it('does not swallow other database errors', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      tx.review.create.mockRejectedValue(new Error('connection lost'));
      await expect(service.create(USER, dto)).rejects.toThrow('connection lost');
    });
  });

  describe('rolling averages', () => {
    it('recomputes the shop rating from every review, inside the transaction', async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(delivered());
      await service.create(USER, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.review.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { vendorId: 'vendor-1' } }),
      );
      expect(tx.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-1' },
        data: { ratingAvg: 4.5, ratingCount: 2 },
      });
    });

    it('falls back to zero when the last review is removed', async () => {
      prisma.review.findUnique.mockResolvedValue({
        authorId: USER,
        vendorId: 'vendor-1',
        productId: null,
      });
      tx.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });

      await service.remove(USER, 'review-1');

      expect(tx.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-1' },
        data: { ratingAvg: 0, ratingCount: 0 },
      });
    });

    it('re-derives the average after an edit, rather than nudging it', async () => {
      prisma.review.findUnique.mockResolvedValue({
        authorId: USER,
        vendorId: 'vendor-1',
        productId: 'product-1',
      });
      tx.review.aggregate.mockResolvedValue({ _avg: { rating: 3 }, _count: { _all: 4 } });

      await service.update(USER, 'review-1', { rating: 3 });

      expect(tx.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-1' },
        data: { ratingAvg: 3, ratingCount: 4 },
      });
      expect(tx.product.update).toHaveBeenCalled();
    });
  });

  describe('ownership of a review', () => {
    it('will not let one customer edit another’s review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        authorId: 'someone-else',
        vendorId: 'vendor-1',
        productId: null,
      });
      await expect(service.update(USER, 'review-1', { rating: 1 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('will not let one customer delete another’s review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        authorId: 'someone-else',
        vendorId: 'vendor-1',
        productId: null,
      });
      await expect(service.remove(USER, 'review-1')).rejects.toThrow(ForbiddenException);
    });

    it('404s on a review that is not there', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.remove(USER, 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listing a shop’s reviews', () => {
    it('404s for an unknown shop', async () => {
      prisma.vendor.findUnique.mockResolvedValue(null);
      await expect(service.listForVendor('ghost-nursery')).rejects.toThrow(NotFoundException);
    });

    it('always returns five rating buckets, zero-filled', async () => {
      prisma.vendor.findUnique.mockResolvedValue({
        id: 'vendor-1',
        name: 'Lalbagh',
        ratingAvg: 4.3333,
        ratingCount: 3,
      });
      prisma.review.groupBy.mockResolvedValue([
        { rating: 5, _count: { _all: 2 } },
        { rating: 3, _count: { _all: 1 } },
      ]);

      const result = await service.listForVendor('lalbagh');

      expect(result.breakdown).toEqual([
        { rating: 5, count: 2 },
        { rating: 4, count: 0 },
        { rating: 3, count: 1 },
        { rating: 2, count: 0 },
        { rating: 1, count: 0 },
      ]);
      expect(result.vendor.ratingAvg).toBe(4.33);
    });
  });
});
