import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateVendorProfileDto } from './dto/vendor.dto';

const VENDOR_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  phone: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  latitude: true,
  longitude: true,
  deliveryRadiusKm: true,
  deliveryFee: true,
  minOrderValue: true,
  ratingAvg: true,
  ratingCount: true,
  approved: true,
  approvedAt: true,
  suspended: true,
  createdAt: true,
};

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: VENDOR_SELECT,
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  /**
   * Updating latitude/longitude is enough to move the shop on the map: the
   * `sync_vendor_location` trigger rewrites the PostGIS geography column.
   */
  async updateOwnProfile(vendorId: string, dto: UpdateVendorProfileDto) {
    await this.getOwnProfile(vendorId);

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.addressLine !== undefined ? { addressLine: dto.addressLine } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.pincode !== undefined ? { pincode: dto.pincode } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.deliveryRadiusKm !== undefined ? { deliveryRadiusKm: dto.deliveryRadiusKm } : {}),
        ...(dto.deliveryFee !== undefined ? { deliveryFee: dto.deliveryFee } : {}),
        ...(dto.minOrderValue !== undefined ? { minOrderValue: dto.minOrderValue } : {}),
      },
    });

    return this.getOwnProfile(vendorId);
  }
}
