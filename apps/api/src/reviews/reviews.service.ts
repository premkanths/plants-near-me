import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes a review for one delivered order line.
   *
   * Three things are enforced here, and they are the whole point of the
   * feature: you can only review a shop you actually bought from, only after
   * it delivered, and only once per order. Without that, ratings are just a
   * comment box.
   */
  async create(userId: string, dto: CreateReviewDto) {
    const vendorOrder = await this.prisma.vendorOrder.findFirst({
      where: { id: dto.vendorOrderId },
      select: {
        id: true,
        status: true,
        vendorId: true,
        masterOrder: { select: { customerId: true } },
        items: { select: { productId: true } },
      },
    });

    if (!vendorOrder) throw new NotFoundException('Order not found');
    if (vendorOrder.masterOrder.customerId !== userId) {
      // 404 rather than 403: don't confirm that someone else's order exists.
      throw new NotFoundException('Order not found');
    }
    if (vendorOrder.status !== 'DELIVERED') {
      throw new BadRequestException('You can review a shop once your order has been delivered');
    }

    // A product review must be for something that was actually in the box.
    if (dto.productId && !vendorOrder.items.some((item) => item.productId === dto.productId)) {
      throw new BadRequestException('That plant was not part of this order');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            authorId: userId,
            vendorId: vendorOrder.vendorId,
            vendorOrderId: vendorOrder.id,
            productId: dto.productId ?? null,
            rating: dto.rating,
            comment: dto.comment ?? null,
          },
          select: this.selection(),
        });

        await this.recomputeVendorRating(tx, vendorOrder.vendorId);
        if (dto.productId) await this.recomputeProductRating(tx, dto.productId);

        return review;
      });
    } catch (error) {
      // The unique index on (author, order, product) is what actually prevents
      // a second review; checking first would be a race.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this order');
      }
      throw error;
    }
  }

  /** Editing re-derives the averages, so a changed score is reflected at once. */
  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const existing = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { authorId: true, vendorId: true, productId: true },
    });

    if (!existing) throw new NotFoundException('Review not found');
    if (existing.authorId !== userId) throw new ForbiddenException('That is not your review');

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.update({
        where: { id: reviewId },
        data: { rating: dto.rating, comment: dto.comment },
        select: this.selection(),
      });

      await this.recomputeVendorRating(tx, existing.vendorId);
      if (existing.productId) await this.recomputeProductRating(tx, existing.productId);

      return review;
    });
  }

  async remove(userId: string, reviewId: string) {
    const existing = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { authorId: true, vendorId: true, productId: true },
    });

    if (!existing) throw new NotFoundException('Review not found');
    if (existing.authorId !== userId) throw new ForbiddenException('That is not your review');

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await this.recomputeVendorRating(tx, existing.vendorId);
      if (existing.productId) await this.recomputeProductRating(tx, existing.productId);
    });

    return { deleted: true };
  }

  /** Public: a shop's reviews, newest first, with its rating breakdown. */
  async listForVendor(slug: string, page = 1, pageSize = 10) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { slug },
      select: { id: true, name: true, ratingAvg: true, ratingCount: true },
    });
    if (!vendor) throw new NotFoundException('Shop not found');

    const [items, breakdown] = await Promise.all([
      this.prisma.review.findMany({
        where: { vendorId: vendor.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.selection(),
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { vendorId: vendor.id },
        _count: { _all: true },
      }),
    ]);

    return {
      vendor: {
        id: vendor.id,
        name: vendor.name,
        ratingAvg: Number(vendor.ratingAvg.toFixed(2)),
        ratingCount: vendor.ratingCount,
      },
      items,
      total: vendor.ratingCount,
      page,
      pageSize,
      // Always five buckets, so the UI can render the bars without gaps.
      breakdown: [5, 4, 3, 2, 1].map((stars) => ({
        rating: stars,
        count: breakdown.find((row) => row.rating === stars)?._count._all ?? 0,
      })),
    };
  }

  /** The customer's own reviews plus the orders still waiting for one. */
  async mine(userId: string) {
    const [written, awaiting] = await Promise.all([
      this.prisma.review.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        select: { ...this.selection(), vendorOrderId: true },
      }),
      this.prisma.vendorOrder.findMany({
        where: {
          status: 'DELIVERED',
          masterOrder: { customerId: userId },
          reviews: { none: { authorId: userId } },
        },
        orderBy: { deliveredAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          deliveredAt: true,
          vendor: { select: { id: true, name: true, slug: true } },
          items: { select: { productId: true, productTitle: true } },
        },
      }),
    ]);

    return { written, awaiting };
  }

  /**
   * Recomputes a shop's rating from its reviews.
   *
   * Deliberately a full aggregate rather than an incremental running average:
   * edits and deletions make incremental updates drift, and this is one cheap
   * indexed query.
   */
  private async recomputeVendorRating(tx: Prisma.TransactionClient, vendorId: string) {
    const stats = await tx.review.aggregate({
      where: { vendorId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await tx.vendor.update({
      where: { id: vendorId },
      data: {
        ratingAvg: stats._avg.rating ?? 0,
        ratingCount: stats._count._all,
      },
    });
  }

  private async recomputeProductRating(tx: Prisma.TransactionClient, productId: string) {
    const stats = await tx.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        ratingAvg: stats._avg.rating ?? 0,
        ratingCount: stats._count._all,
      },
    });
  }

  private selection() {
    return {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true, slug: true } },
      product: { select: { id: true, title: true } },
    } satisfies Prisma.ReviewSelect;
  }
}
