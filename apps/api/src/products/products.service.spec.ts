import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

const VENDOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENDOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_OF_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('ProductsService (ownership)', () => {
  const prisma = {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    plant: { findUnique: jest.fn() },
    orderItem: { count: jest.fn() },
    $queryRaw: jest.fn(),
  };

  let service: ProductsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  describe('a vendor cannot touch another vendor’s product', () => {
    beforeEach(() => {
      // The row exists, but it belongs to vendor B
      prisma.product.findUnique.mockResolvedValue({ vendorId: VENDOR_B });
    });

    it('rejects reading it', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: PRODUCT_OF_B, vendorId: VENDOR_B });
      await expect(service.findOneForVendor(VENDOR_A, PRODUCT_OF_B)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects updating it', async () => {
      await expect(service.update(VENDOR_A, PRODUCT_OF_B, { price: 1 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it('rejects changing its stock', async () => {
      prisma.product.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateStock(VENDOR_A, PRODUCT_OF_B, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects deleting it', async () => {
      await expect(service.remove(VENDOR_A, PRODUCT_OF_B)).rejects.toThrow(ForbiddenException);
      expect(prisma.product.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('scopes every stock update to the caller’s vendor id', async () => {
    prisma.product.updateMany.mockResolvedValue({ count: 1 });
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', vendorId: VENDOR_A });

    await service.updateStock(VENDOR_A, 'p1', 7);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', vendorId: VENDOR_A }, // ← ownership is part of the WHERE
      data: { stock: 7 },
    });
  });

  it('ignores any vendorId supplied in the request body', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'plant-1' });
    prisma.product.create.mockResolvedValue({ id: 'new' });

    await service.create(VENDOR_A, {
      plantId: 'plant-1',
      title: 'Monstera',
      price: 899,
      stock: 3,
      // a malicious client trying to create a product for someone else:
      ...({ vendorId: VENDOR_B } as object),
    });

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorId: VENDOR_A }) }),
    );
  });

  it('scopes the product list to the caller', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.listForVendor(VENDOR_A, {});

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_A }) }),
    );
  });

  it('404s for a product that does not exist at all', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.findOneForVendor(VENDOR_A, PRODUCT_OF_B)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deactivates instead of deleting when the product appears in an order', async () => {
    prisma.product.findUnique.mockResolvedValue({ vendorId: VENDOR_A });
    prisma.orderItem.count.mockResolvedValue(2);
    prisma.product.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.remove(VENDOR_A, 'p1');

    expect(result).toEqual({
      deleted: false,
      deactivated: true,
      reason: 'Product appears in past orders',
    });
    expect(prisma.product.deleteMany).not.toHaveBeenCalled();
  });

  it('hard-deletes a product that was never ordered', async () => {
    prisma.product.findUnique.mockResolvedValue({ vendorId: VENDOR_A });
    prisma.orderItem.count.mockResolvedValue(0);
    prisma.product.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove(VENDOR_A, 'p1')).resolves.toEqual({
      deleted: true,
      deactivated: false,
    });
    expect(prisma.product.deleteMany).toHaveBeenCalledWith({
      where: { id: 'p1', vendorId: VENDOR_A },
    });
  });
});
