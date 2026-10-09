import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { CurrentVendorId, Public, Roles } from '../auth/decorators';
import { LOCAL_UPLOAD_DIR, MAX_IMAGE_BYTES, UploadsService } from './uploads.service';

const FILENAME = /^[A-Za-z0-9._-]+$/;
const UUID = /^[0-9a-fA-F-]{36}$/;

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Roles('VENDOR')
  @Post('product-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  upload(@CurrentVendorId() vendorId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.uploads.uploadProductImage(vendorId, file);
  }

  /**
   * Serves locally-stored images. Both path segments are pattern-checked and the
   * resolved path must stay inside the upload directory, so `../` cannot escape it.
   */
  @Public()
  @Get(':vendorId/:filename')
  async serve(
    @Param('vendorId') vendorId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!UUID.test(vendorId) || !FILENAME.test(filename) || filename.includes('..')) {
      throw new NotFoundException('Image not found');
    }

    const path = normalize(join(LOCAL_UPLOAD_DIR, vendorId, filename));
    if (!path.startsWith(LOCAL_UPLOAD_DIR)) throw new NotFoundException('Image not found');

    const exists = await stat(path).catch(() => null);
    if (!exists?.isFile()) throw new NotFoundException('Image not found');

    const contentType =
      {
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.avif': 'image/avif',
      }[extname(path).toLowerCase()] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(path).pipe(res);
  }
}
