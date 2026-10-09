import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { csvFilename, toCsv, type CsvValue } from './csv';
import type {
  ListUsersDto,
  ListVendorsDto,
  UpdateUserStateDto,
  UpdateVendorStateDto,
  VendorFilter,
} from './dto/admin.dto';

export const EXPORT_DATASETS = ['orders', 'vendors', 'users', 'products'] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

/** Orders that never got paid for are noise in every count and chart. */
const REAL_ORDERS: Prisma.MasterOrderWhereInput = { status: { not: 'PENDING_PAYMENT' } };

interface DailyRow {
  day: Date;
  orders: number;
  revenue: string;
}

interface TopVendorRow {
  id: string;
  name: string;
  slug: string;
  orders: number;
  revenue: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Headline counters for the top of the dashboard. */
  async overview() {
    const [usersByRole, vendorCounts, products, ordersByStatus, paid, reviews] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      Promise.all([
        this.prisma.vendor.count(),
        this.prisma.vendor.count({ where: { approved: true, suspended: false } }),
        this.prisma.vendor.count({ where: { approved: false } }),
        this.prisma.vendor.count({ where: { suspended: true } }),
      ]),
      this.prisma.product.count({ where: { active: true } }),
      this.prisma.masterOrder.groupBy({
        by: ['status'],
        where: REAL_ORDERS,
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.review.count(),
    ]);

    const byRole = Object.fromEntries(usersByRole.map((row) => [row.role, row._count._all]));
    const [totalVendors, approvedVendors, pendingVendors, suspendedVendors] = vendorCounts;

    return {
      users: {
        total: usersByRole.reduce((sum, row) => sum + row._count._all, 0),
        customers: byRole.CUSTOMER ?? 0,
        vendors: byRole.VENDOR ?? 0,
        admins: byRole.ADMIN ?? 0,
      },
      vendors: {
        total: totalVendors,
        approved: approvedVendors,
        pending: pendingVendors,
        suspended: suspendedVendors,
      },
      catalogue: { activeProducts: products },
      orders: {
        total: ordersByStatus.reduce((sum, row) => sum + row._count._all, 0),
        byStatus: Object.fromEntries(ordersByStatus.map((row) => [row.status, row._count._all])),
      },
      // Money that actually cleared — COD counts only once it is settled.
      revenue: (paid._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      reviews,
    };
  }

  /**
   * Chart data. The daily series is zero-filled in SQL with `generate_series`
   * so quiet days still produce a point — otherwise a line chart silently
   * joins across the gap and overstates a flat week as steady trade.
   */
  async analytics(days: number) {
    const daily = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT d::date                                        AS day,
             COUNT(mo.id)::int                              AS orders,
             COALESCE(SUM(mo.grand_total), 0)::text         AS revenue
      FROM generate_series(
             CURRENT_DATE - (${days}::int - 1),
             CURRENT_DATE,
             interval '1 day'
           ) AS d
      LEFT JOIN master_orders mo
             ON mo.placed_at >= d
            AND mo.placed_at <  d + interval '1 day'
            AND mo.status <> 'PENDING_PAYMENT'
      GROUP BY d
      ORDER BY d
    `;

    const topVendors = await this.prisma.$queryRaw<TopVendorRow[]>`
      SELECT v.id,
             v.name,
             v.slug,
             COUNT(vo.id)::int                  AS orders,
             COALESCE(SUM(vo.total), 0)::text   AS revenue
      FROM vendor_orders vo
      JOIN vendors v ON v.id = vo.vendor_id
      WHERE vo.status = 'DELIVERED'
        AND vo.created_at >= CURRENT_DATE - (${days}::int - 1)
      GROUP BY v.id, v.name, v.slug
      ORDER BY SUM(vo.total) DESC
      LIMIT 5
    `;

    const [statusSplit, topPlants] = await Promise.all([
      this.prisma.vendorOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.orderItem.groupBy({
        by: ['plantName'],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      days,
      daily: daily.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        orders: row.orders,
        revenue: Number(row.revenue),
      })),
      topVendors: topVendors.map((row) => ({ ...row, revenue: Number(row.revenue) })),
      vendorOrderStatus: statusSplit.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      topPlants: topPlants.map((row) => ({
        plantName: row.plantName,
        quantity: row._sum.quantity ?? 0,
      })),
    };
  }

  // ───────────────────────── vendors ─────────────────────────

  private vendorWhere(status: VendorFilter, q?: string): Prisma.VendorWhereInput {
    const byStatus: Record<VendorFilter, Prisma.VendorWhereInput> = {
      all: {},
      pending: { approved: false },
      approved: { approved: true, suspended: false },
      suspended: { suspended: true },
    };

    return {
      ...byStatus[status],
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async listVendors(dto: ListVendorsDto) {
    const where = this.vendorWhere(dto.status, dto.q);

    const [total, items] = await Promise.all([
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where,
        orderBy: [{ approved: 'asc' }, { createdAt: 'desc' }],
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          approved: true,
          suspended: true,
          ratingAvg: true,
          ratingCount: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true, isActive: true } },
          _count: { select: { products: true, vendorOrders: true } },
        },
      }),
    ]);

    return {
      items: items.map((vendor) => ({
        ...vendor,
        ratingAvg: Number(vendor.ratingAvg.toFixed(2)),
        productCount: vendor._count.products,
        orderCount: vendor._count.vendorOrders,
      })),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }

  /**
   * Approving stamps `approvedAt` the first time only, so the audit trail
   * records when the shop was let in rather than when an admin last toggled
   * a checkbox.
   */
  async setVendorState(id: string, dto: UpdateVendorStateDto) {
    if (dto.approved === undefined && dto.suspended === undefined) {
      throw new BadRequestException('Nothing to change');
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: { id: true, approvedAt: true },
    });
    if (!vendor) throw new NotFoundException('Nursery not found');

    return this.prisma.vendor.update({
      where: { id },
      data: {
        ...(dto.approved !== undefined
          ? {
              approved: dto.approved,
              approvedAt: dto.approved ? (vendor.approvedAt ?? new Date()) : null,
            }
          : {}),
        ...(dto.suspended !== undefined ? { suspended: dto.suspended } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        approved: true,
        approvedAt: true,
        suspended: true,
      },
    });
  }

  // ───────────────────────── users ─────────────────────────

  async listUsers(dto: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(dto.role ? { role: dto.role } : {}),
      ...(dto.q
        ? {
            OR: [
              { name: { contains: dto.q, mode: 'insensitive' } },
              { email: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          vendor: { select: { id: true, name: true, slug: true } },
          _count: { select: { orders: true, reviews: true } },
        },
      }),
    ]);

    return {
      items: items.map((user) => ({
        ...user,
        orderCount: user._count.orders,
        reviewCount: user._count.reviews,
      })),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }

  /**
   * Deactivating a user is the account kill switch, so it is also the easiest
   * way for an admin to lock themselves out. Blocked explicitly.
   */
  async setUserState(actingAdminId: string, id: string, dto: UpdateUserStateDto) {
    if (id === actingAdminId && !dto.isActive) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        // Kick them out now rather than at token expiry.
        ...(dto.isActive ? {} : { refreshTokenHash: null }),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
  }

  // ───────────────────────── CSV export ─────────────────────────

  async exportCsv(dataset: ExportDataset): Promise<{ filename: string; body: string }> {
    const builders: Record<
      ExportDataset,
      () => Promise<{ headers: string[]; rows: CsvValue[][] }>
    > = {
      orders: () => this.ordersCsv(),
      vendors: () => this.vendorsCsv(),
      users: () => this.usersCsv(),
      products: () => this.productsCsv(),
    };

    const { headers, rows } = await builders[dataset]();
    return { filename: csvFilename(dataset), body: toCsv(headers, rows) };
  }

  /** One row per vendor slice: that is the unit an operations team chases. */
  private async ordersCsv() {
    const orders = await this.prisma.vendorOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        deliveredAt: true,
        vendor: { select: { name: true, city: true } },
        masterOrder: {
          select: {
            orderNumber: true,
            status: true,
            city: true,
            pincode: true,
            customer: { select: { name: true, email: true } },
            payment: { select: { provider: true, status: true } },
          },
        },
        _count: { select: { items: true } },
      },
    });

    return {
      headers: [
        'vendor_order',
        'master_order',
        'placed_at',
        'delivered_at',
        'vendor',
        'vendor_city',
        'customer',
        'customer_email',
        'delivery_city',
        'pincode',
        'lines',
        'total_inr',
        'vendor_order_status',
        'master_order_status',
        'payment_method',
        'payment_status',
      ],
      rows: orders.map((order) => [
        order.orderNumber,
        order.masterOrder.orderNumber,
        order.createdAt,
        order.deliveredAt,
        order.vendor.name,
        order.vendor.city,
        order.masterOrder.customer.name,
        order.masterOrder.customer.email,
        order.masterOrder.city,
        order.masterOrder.pincode,
        order._count.items,
        order.total.toFixed(2),
        order.status,
        order.masterOrder.status,
        order.masterOrder.payment?.provider ?? '',
        order.masterOrder.payment?.status ?? '',
      ]),
    };
  }

  private async vendorsCsv() {
    const vendors = await this.prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        slug: true,
        city: true,
        pincode: true,
        approved: true,
        suspended: true,
        ratingAvg: true,
        ratingCount: true,
        deliveryRadiusKm: true,
        createdAt: true,
        user: { select: { email: true } },
        _count: { select: { products: true, vendorOrders: true } },
      },
    });

    return {
      headers: [
        'name',
        'slug',
        'email',
        'city',
        'pincode',
        'approved',
        'suspended',
        'rating_avg',
        'rating_count',
        'delivery_radius_km',
        'products',
        'orders',
        'joined_at',
      ],
      rows: vendors.map((vendor) => [
        vendor.name,
        vendor.slug,
        vendor.user.email,
        vendor.city,
        vendor.pincode,
        vendor.approved,
        vendor.suspended,
        vendor.ratingAvg.toFixed(2),
        vendor.ratingCount,
        vendor.deliveryRadiusKm,
        vendor._count.products,
        vendor._count.vendorOrders,
        vendor.createdAt,
      ]),
    };
  }

  private async usersCsv() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true, reviews: true } },
      },
    });

    return {
      // No password hashes, no refresh tokens — an export leaves the building.
      headers: ['email', 'name', 'phone', 'role', 'active', 'orders', 'reviews', 'joined_at'],
      rows: users.map((user) => [
        user.email,
        user.name,
        user.phone,
        user.role,
        user.isActive,
        user._count.orders,
        user._count.reviews,
        user.createdAt,
      ]),
    };
  }

  private async productsCsv() {
    const products = await this.prisma.product.findMany({
      orderBy: [{ vendor: { name: 'asc' } }, { title: 'asc' }],
      select: {
        title: true,
        price: true,
        stock: true,
        potSize: true,
        active: true,
        ratingAvg: true,
        ratingCount: true,
        vendor: { select: { name: true } },
        plant: { select: { commonName: true, scientificName: true } },
      },
    });

    return {
      headers: [
        'vendor',
        'title',
        'plant',
        'scientific_name',
        'pot_size',
        'price_inr',
        'stock',
        'active',
        'rating_avg',
        'rating_count',
      ],
      rows: products.map((product) => [
        product.vendor.name,
        product.title,
        product.plant.commonName,
        product.plant.scientificName,
        product.potSize,
        product.price.toFixed(2),
        product.stock,
        product.active,
        product.ratingAvg.toFixed(2),
        product.ratingCount,
      ]),
    };
  }
}
