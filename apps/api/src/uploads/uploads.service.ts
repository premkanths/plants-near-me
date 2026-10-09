import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';

export interface UploadedImage {
  url: string;
  publicId: string;
  provider: 'cloudinary' | 'local';
  bytes: number;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Where local files land when Cloudinary is not configured. Git-ignored. */
export const LOCAL_UPLOAD_DIR = join(process.cwd(), 'uploads');

/**
 * Image uploads always go through the API, never straight from the browser:
 * the Cloudinary secret stays server-side and size/MIME checks cannot be bypassed.
 * With no credentials configured the service falls back to local disk, so the
 * project runs end-to-end without a third-party account.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  readonly usingCloudinary: boolean;

  constructor() {
    const url = process.env.CLOUDINARY_URL;
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

    if (url) {
      cloudinary.config({ secure: true });
      this.usingCloudinary = true;
    } else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
      });
      this.usingCloudinary = true;
    } else {
      this.usingCloudinary = false;
      this.logger.warn('Cloudinary is not configured — image uploads are stored on local disk');
    }
  }

  /** Validates then stores one image, returning a URL the web app can render. */
  async uploadProductImage(vendorId: string, file?: Express.Multer.File): Promise<UploadedImage> {
    if (!file) throw new BadRequestException('No file uploaded — send it as the "file" field');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported type ${file.mimetype}. Use JPEG, PNG, WebP or AVIF`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image is larger than 5 MB');
    }

    return this.usingCloudinary
      ? this.toCloudinary(vendorId, file)
      : this.toLocalDisk(vendorId, file);
  }

  private toCloudinary(vendorId: string, file: Express.Multer.File): Promise<UploadedImage> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `eplant/products/${vendorId}`,
          resource_type: 'image',
          transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Cloudinary upload failed: ${error?.message}`);
            reject(new BadRequestException('Image upload failed, please try again'));
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            provider: 'cloudinary',
            bytes: result.bytes,
          });
        },
      );
      stream.end(file.buffer);
    });
  }

  private async toLocalDisk(vendorId: string, file: Express.Multer.File): Promise<UploadedImage> {
    const extension =
      {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/avif': 'avif',
      }[file.mimetype] ?? 'bin';

    const filename = `${randomUUID()}.${extension}`;
    const directory = join(LOCAL_UPLOAD_DIR, vendorId);

    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), file.buffer);

    return {
      url: `/api/uploads/${vendorId}/${filename}`,
      publicId: `${vendorId}/${filename}`,
      provider: 'local',
      bytes: file.size,
    };
  }
}
