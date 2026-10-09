import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

/** Only the delegates the service actually touches. */
const prismaMock = () => ({
  user: {
    groupBy: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  vendor: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  product: { count: jest.fn(), findMany: jest.fn() },
  masterOrder: { groupBy: jest.fn() },
  vendorOrder: { groupBy: jest.fn(), findMany: jest.fn() },
  orderItem: { groupBy: jest.fn() },
  payment: { aggregate: jest.fn() },
  review: { count: jest.fn() },
  $queryRaw: jest.fn(),
});

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof prismaMock>;

  beforeEach(async () => {
    prisma = prismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  describe('overview', () => {
    beforeEach(() => {
      prisma.user.groupBy.mockResolvedValue([
        { role: 'CUSTOMER', _count: { _all: 5 } },
        { role: 'VENDOR', _count: { _all: 3 } },
      ]);
      prisma.vendor.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      prisma.product.count.mockResolvedValue(38);
      prisma.masterOrder.groupBy.mockResolvedValue([
        { status: 'PLACED', _count: { _all: 2 } },
        { status: 'COMPLETED', _count: { _all: 4 } },
      ]);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      prisma.review.count.mockResolvedValue(7);
    });

    it('totals users by role and fills missing roles with zero', async () => {
      const result = await service.overview();

      expect(result.users).toEqual({ total: 8, customers: 5, vendors: 3, admins: 0 });
    });

    it('reports zero revenue as a money string, not null', async () => {
      await expect(service.overview()).resolves.toMatchObject({ revenue: '0.00' });
    });

    it('counts only paid money as revenue', async () => {
      await service.overview();

      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PAID' } }),
      );
    });

    it('excludes abandoned (unpaid) checkouts from order counts', async () => {
      await service.overview();

      expect(prisma.masterOrder.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { not: 'PENDING_PAYMENT' } } }),
      );
    });
  });

  describe('analytics', () => {
    beforeEach(() => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { day: new Date('2026-09-30T00:00:00Z'), orders: 0, revenue: '0' },
          { day: new Date('2026-10-01T00:00:00Z'), orders: 2, revenue: '1499.50' },
        ])
        .mockResolvedValueOnce([
          { id: 'v1', name: 'Lalbagh', slug: 'lalbagh', orders: 3, revenue: '2000.00' },
        ]);
      prisma.vendorOrder.groupBy.mockResolvedValue([{ status: 'DELIVERED', _count: { _all: 4 } }]);
      prisma.orderItem.groupBy.mockResolvedValue([
        { plantName: 'Aloe Vera', _sum: { quantity: 9 } },
      ]);
    });

    it('returns a point per day including quiet ones', async () => {
      const result = await service.analytics(30);

      expect(result.daily).toEqual([
        { day: '2026-09-30', orders: 0, revenue: 0 },
        { day: '2026-10-01', orders: 2, revenue: 1499.5 },
      ]);
    });

    it('converts raw money strings to numbers the chart can plot', async () => {
      const result = await service.analytics(30);

      expect(result.topVendors[0].revenue).toBe(2000);
    });

    it('summarises status split and best sellers', async () => {
      const result = await service.analytics(7);

      expect(result.days).toBe(7);
      expect(result.vendorOrderStatus).toEqual([{ status: 'DELIVERED', count: 4 }]);
      expect(result.topPlants).toEqual([{ plantName: 'Aloe Vera', quantity: 9 }]);
    });
  });

  describe('listVendors', () => {
    beforeEach(() => {
      prisma.vendor.count.mockResolvedValue(1);
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v1',
          name: 'Hebbal',
          slug: 'hebbal',
          city: 'Bengaluru',
          approved: false,
          suspended: false,
          ratingAvg: 4.3333,
          ratingCount: 3,
          createdAt: new Date(),
          user: { id: 'u1', email: 'h@x.test', name: 'H', isActive: true },
          _count: { products: 4, vendorOrders: 2 },
        },
      ]);
    });

    it('rounds the cached average for display', async () => {
      const result = await service.listVendors({ status: 'all', page: 1, pageSize: 20 });

      expect(result.items[0].ratingAvg).toBe(4.33);
      expect(result.items[0].productCount).toBe(4);
    });

    it('translates the pending filter into approved: false', async () => {
      await service.listVendors({ status: 'pending', page: 1, pageSize: 20 });

      expect(prisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { approved: false } }),
      );
    });

    it('treats approved as approved-and-not-suspended', async () => {
      await service.listVendors({ status: 'approved', page: 1, pageSize: 20 });

      expect(prisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { approved: true, suspended: false } }),
      );
    });

    it('searches name, city and owner email', async () => {
      await service.listVendors({ status: 'all', q: 'heb', page: 1, pageSize: 20 });

      const where = prisma.vendor.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(3);
    });

    it('pages with skip/take', async () => {
      await service.listVendors({ status: 'all', page: 3, pageSize: 10 });

      expect(prisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('setVendorState', () => {
    it('rejects an empty patch', async () => {
      await expect(service.setVendorState('v1', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vendor.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown shop', async () => {
      prisma.vendor.findUnique.mockResolvedValue(null);

      await expect(service.setVendorState('v1', { approved: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stamps approvedAt the first time a shop is approved', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', approvedAt: null });
      prisma.vendor.update.mockResolvedValue({});

      await service.setVendorState('v1', { approved: true });

      expect(prisma.vendor.update.mock.calls[0][0].data.approvedAt).toBeInstanceOf(Date);
    });

    it('keeps the original approval date on a re-approval', async () => {
      const original = new Date('2026-01-01T00:00:00Z');
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', approvedAt: original });
      prisma.vendor.update.mockResolvedValue({});

      await service.setVendorState('v1', { approved: true });

      expect(prisma.vendor.update.mock.calls[0][0].data.approvedAt).toBe(original);
    });

    it('clears the approval date when a shop is un-approved', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', approvedAt: new Date() });
      prisma.vendor.update.mockResolvedValue({});

      await service.setVendorState('v1', { approved: false });

      expect(prisma.vendor.update.mock.calls[0][0].data.approvedAt).toBeNull();
    });

    it('suspends without touching approval', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', approvedAt: new Date() });
      prisma.vendor.update.mockResolvedValue({});

      await service.setVendorState('v1', { suspended: true });

      expect(prisma.vendor.update.mock.calls[0][0].data).toEqual({ suspended: true });
    });
  });

  describe('setUserState', () => {
    it('refuses to let an admin deactivate themselves', async () => {
      await expect(service.setUserState('a1', 'a1', { isActive: false })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows an admin to reactivate themselves', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'a1' });
      prisma.user.update.mockResolvedValue({});

      await expect(service.setUserState('a1', 'a1', { isActive: true })).resolves.toBeDefined();
    });

    it('404s for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setUserState('a1', 'u9', { isActive: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('drops the refresh token when deactivating, so the session dies now', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({});

      await service.setUserState('a1', 'u1', { isActive: false });

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        isActive: false,
        refreshTokenHash: null,
      });
    });

    it('does not touch the refresh token when reactivating', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({});

      await service.setUserState('a1', 'u1', { isActive: true });

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ isActive: true });
    });
  });

  describe('exportCsv', () => {
    it('never exports password hashes or refresh tokens', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.exportCsv('users');

      const select = prisma.user.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('passwordHash');
      expect(select).not.toHaveProperty('refreshTokenHash');
    });

    it('builds a users file with a dated name and a header row', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'a@x.test',
          name: 'Asha',
          phone: null,
          role: 'CUSTOMER',
          isActive: true,
          createdAt: new Date('2026-10-01T00:00:00Z'),
          _count: { orders: 2, reviews: 1 },
        },
      ]);

      const { filename, body } = await service.exportCsv('users');

      expect(filename).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(body).toContain('email,name,phone,role,active,orders,reviews,joined_at');
      expect(body).toContain('a@x.test,Asha,,CUSTOMER,yes,2,1,2026-10-01T00:00:00.000Z');
    });

    it('exports one row per vendor slice of an order', async () => {
      prisma.vendorOrder.findMany.mockResolvedValue([
        {
          orderNumber: 'EP-261001-AAA111-V1',
          status: 'DELIVERED',
          total: { toFixed: () => '499.00' },
          createdAt: new Date('2026-10-01T00:00:00Z'),
          deliveredAt: null,
          vendor: { name: 'Lalbagh', city: 'Bengaluru' },
          masterOrder: {
            orderNumber: 'EP-261001-AAA111',
            status: 'COMPLETED',
            city: 'Bengaluru',
            pincode: '560001',
            customer: { name: 'Asha', email: 'a@x.test' },
            payment: { provider: 'COD', status: 'PAID' },
          },
          _count: { items: 2 },
        },
      ]);

      const { body } = await service.exportCsv('orders');

      expect(body).toContain('EP-261001-AAA111-V1');
      expect(body).toContain('499.00');
      expect(body).toContain('COD,PAID');
    });

    it('leaves payment columns blank when an order has no payment row', async () => {
      prisma.vendorOrder.findMany.mockResolvedValue([
        {
          orderNumber: 'EP-1-V1',
          status: 'ORDERED',
          total: { toFixed: () => '10.00' },
          createdAt: new Date('2026-10-01T00:00:00Z'),
          deliveredAt: null,
          vendor: { name: 'V', city: 'C' },
          masterOrder: {
            orderNumber: 'EP-1',
            status: 'PLACED',
            city: 'C',
            pincode: '1',
            customer: { name: 'N', email: 'e' },
            payment: null,
          },
          _count: { items: 1 },
        },
      ]);

      const { body } = await service.exportCsv('orders');

      expect(body.trimEnd().endsWith('ORDERED,PLACED,,')).toBe(true);
    });
  });
});
