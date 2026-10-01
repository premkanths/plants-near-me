import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators';
import { AdminService, EXPORT_DATASETS, type ExportDataset } from './admin.service';
import {
  AnalyticsRangeDto,
  ListUsersDto,
  ListVendorsDto,
  UpdateUserStateDto,
  UpdateVendorStateDto,
} from './dto/admin.dto';
import { BadRequestException } from '@nestjs/common';

/** Every route here is admin-only; the guard is applied at the class level. */
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('analytics')
  analytics(@Query() query: AnalyticsRangeDto) {
    return this.admin.analytics(query.days);
  }

  @Get('vendors')
  listVendors(@Query() query: ListVendorsDto) {
    return this.admin.listVendors(query);
  }

  @Patch('vendors/:id')
  setVendorState(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorStateDto) {
    return this.admin.setVendorState(id, dto);
  }

  @Get('users')
  listUsers(@Query() query: ListUsersDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id')
  setUserState(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStateDto,
  ) {
    return this.admin.setUserState(adminId, id, dto);
  }

  /**
   * Download rather than JSON: the browser gets a real file, so the web app
   * can link straight at it instead of building a blob client-side.
   */
  @Get('export/:dataset')
  async export(@Param('dataset') dataset: string, @Res() res: Response) {
    if (!EXPORT_DATASETS.includes(dataset as ExportDataset)) {
      throw new BadRequestException(`Unknown dataset. Try: ${EXPORT_DATASETS.join(', ')}`);
    }

    const { filename, body } = await this.admin.exportCsv(dataset as ExportDataset);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }
}
