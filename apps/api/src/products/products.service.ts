import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

const PRODUCT_INCLUDE = {
  plant: {
    select: { id: true, commonName: true, scientificName: true, slug: true, imageUrl: true },
  },
} satisfies Prisma.ProductInclude;

/**
 * Every method here is vendor-scoped.
 *
 * Ownership is enforced by putting `vendorId` in the WHERE clause of the write
 * itself (not by reading the row, checking it, then writing). That makes it
 * impossible for a vendor to touch another vendor's row even under a race, and
 * there is no code path where a caller can pass their own vendorId.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForVendor(vendorId: string, query: ListProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      vendorId,
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { plant: { commonName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, take: query.take ?? 50, skip: query.skip ?? 0 };
  }

  async statsForVendor(vendorId: string) {
    const [total, active, outOfStock, lowStock, inventoryValue] = await Promise.all([
      this.prisma.product.count({ where: { vendorId } }),
      this.prisma.product.count({ where: { vendorId, active: true } }),
      this.prisma.product.count({ where: { vendorId, stock: 0 } }),
      this.prisma.product.count({ where: { vendorId, stock: { gt: 0, lte: 5 } } }),
      this.prisma.$queryRaw<{ value: string | null }[]>`
        SELECT COALESCE(SUM(price * stock), 0)::text AS value
        FROM products WHERE vendor_id = ${vendorId}::uuid
      `,
    ]);

    return {
      total,
      active,
      outOfStock,
      lowStock,
      inventoryValue: Number(inventoryValue[0]?.value ?? 0),
    };
  }

  async findOneForVendor(vendorId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: PRODUCT_INCLUDE,
    });

    if (!product) throw new NotFoundException('Product not found');
    // Deliberately the same error as "not found" would be too leaky the other way:
    // we want an explicit 403 so the behaviour is testable and obvious in logs.
    if (product.vendorId !== vendorId) {
      throw new ForbiddenException('This product belongs to another vendor');
    }
    return product;
  }

  async create(vendorId: string, dto: CreateProductDto) {
    const plant = await this.prisma.plant.findUnique({
      where: { id: dto.plantId },
      select: { id: true },
    });
    if (!plant) throw new BadRequestException('Unknown plant');

    try {
      return await this.prisma.product.create({
        data: {
          vendorId, // ← always from the JWT, never from the request body
          plantId: dto.plantId,
          title: dto.title.trim(),
          description: dto.description,
          price: new Prisma.Decimal(dto.price),
          stock: dto.stock,
          potSize: dto.potSize,
          images: dto.images ?? [],
          active: dto.active ?? true,
        },
        include: PRODUCT_INCLUDE,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'You already list this plant in that pot size — edit the existing product instead',
        );
      }
      throw error;
    }
  }

  async update(vendorId: string, productId: string, dto: UpdateProductDto) {
    await this.assertOwnership(vendorId, productId);

    try {
      const result = await this.prisma.product.updateMany({
        where: { id: productId, vendorId }, // ownership is part of the write
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
          ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
          ...(dto.potSize !== undefined ? { potSize: dto.potSize } : {}),
          ...(dto.images !== undefined ? { images: dto.images } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      if (result.count === 0)
        throw new ForbiddenException('This product belongs to another vendor');
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('You already list this plant in that pot size');
      }
      throw error;
    }

    return this.findOneForVendor(vendorId, productId);
  }

  async updateStock(vendorId: string, productId: string, stock: number) {
    const result = await this.prisma.product.updateMany({
      where: { id: productId, vendorId },
      data: { stock },
    });
    if (result.count === 0) {
      await this.assertOwnership(vendorId, productId); // throws 404 or 403 appropriately
    }
    return this.findOneForVendor(vendorId, productId);
  }

  /**
   * Products referenced by an order cannot be deleted (ON DELETE RESTRICT), so
   * they are deactivated instead — order history stays intact either way.
   */
  async remove(vendorId: string, productId: string) {
    await this.assertOwnership(vendorId, productId);

    const orderedCount = await this.prisma.orderItem.count({ where: { productId } });
    if (orderedCount > 0) {
      await this.prisma.product.updateMany({
        where: { id: productId, vendorId },
        data: { active: false },
      });
      return { deleted: false, deactivated: true, reason: 'Product appears in past orders' };
    }

    const result = await this.prisma.product.deleteMany({ where: { id: productId, vendorId } });
    if (result.count === 0) throw new ForbiddenException('This product belongs to another vendor');
    return { deleted: true, deactivated: false };
  }

  private async assertOwnership(vendorId: string, productId: string): Promise<void> {
    const owner = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { vendorId: true },
    });
    if (!owner) throw new NotFoundException('Product not found');
    if (owner.vendorId !== vendorId) {
      throw new ForbiddenException('This product belongs to another vendor');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
    );
  }
}
