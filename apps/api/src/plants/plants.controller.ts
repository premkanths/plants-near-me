import { Controller, Get, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../auth/decorators';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

class ListPlantsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number;
}

/**
 * Species catalogue. Used by the vendor product form to pick a plant.
 * Full typo-tolerant search over products lands in Step 6.
 */
@Controller('plants')
export class PlantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async list(@Query() query: ListPlantsQueryDto) {
    const where: Prisma.PlantWhereInput = query.search
      ? {
          OR: [
            { commonName: { contains: query.search, mode: 'insensitive' } },
            { scientificName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const items = await this.prisma.plant.findMany({
      where,
      select: {
        id: true,
        commonName: true,
        scientificName: true,
        slug: true,
        sunlight: true,
        water: true,
        difficulty: true,
        placement: true,
        imageUrl: true,
      },
      orderBy: { commonName: 'asc' },
      take: query.take ?? 50,
    });

    return { items, total: items.length };
  }
}
