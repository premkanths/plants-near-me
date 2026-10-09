import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentVendorId, Roles } from '../auth/decorators';
import { UpdateVendorProfileDto } from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

@Roles('VENDOR')
@Controller('vendor/profile')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  getProfile(@CurrentVendorId() vendorId: string) {
    return this.vendors.getOwnProfile(vendorId);
  }

  @Patch()
  updateProfile(@CurrentVendorId() vendorId: string, @Body() dto: UpdateVendorProfileDto) {
    return this.vendors.updateOwnProfile(vendorId, dto);
  }
}
