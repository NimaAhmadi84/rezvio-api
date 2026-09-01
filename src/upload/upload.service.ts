import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  validateImageMagicBytes,
  validateImageSize,
  validateImageResolution,
} from './validators/image-validator';
import { processBusinessLogo } from './processors/image-processor';

/**
 * Multer file interface — inline definition to avoid @types/multer dependency
 * Matches Express.Multer.File structure used by NestJS FileInterceptor
 */
export interface MulterFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  optimized: boolean;
  originalSize: number;
}



@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private supabase: SupabaseClient;
  private readonly bucket: string;
  private readonly maxSize: number = 10 * 1024 * 1024; // 10MB

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_SECRET_KEY');
    this.bucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'business-logos';

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured');
    }

    this.supabase = createClient(url, key);
    this.logger.log(`✅ Supabase Storage initialized (bucket: ${this.bucket})`);
  }

  /**
   * Upload and process business logo image
   * - Magic bytes validation
   * - Size validation
   * - Resolution validation (min 200x200)
   * - Auto-rotate + WebP conversion + smart resize
   */
  async uploadBusinessLogo(
    file: MulterFile,
    userId: string,
  ): Promise<UploadResult> {
    // Step 1: Validate file exists
    if (!file || !file.buffer) {
      throw new BadRequestException('فایلی ارسال نشده است');
    }

    const originalSize = file.buffer.length;

    // Step 2: Validate size
    const sizeValidation = validateImageSize(file.buffer, this.maxSize);
    if (!sizeValidation.valid) {
      throw new BadRequestException(sizeValidation.error);
    }

    // Step 3: Validate magic bytes (real file type, not just extension)
    const magicValidation = validateImageMagicBytes(file.buffer);
    if (!magicValidation.valid) {
      throw new BadRequestException(magicValidation.error);
    }

    // Step 4: Validate resolution (minimum 200x200)
    const resolutionValidation = await validateImageResolution(file.buffer);
    if (!resolutionValidation.valid) {
      throw new BadRequestException(resolutionValidation.error);
    }

    this.logger.log(
      `📥 Received image: ${resolutionValidation.width}×${resolutionValidation.height}, ${(originalSize / 1024).toFixed(1)}KB`,
    );

    // Step 5: Process image (auto-rotate, WebP, smart resize)
    let processed: { buffer: Buffer; format: string; width: number; height: number; size: number };
    try {
      processed = await processBusinessLogo(file.buffer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Image processing failed: ${errorMessage}`);
      throw new BadRequestException('خطا در پردازش تصویر. لطفاً فایل معتبر ارسال کنید.');
    }

    const wasOptimized = processed.size < originalSize;
    this.logger.log(
      `✨ Processed: ${processed.width}×${processed.height}, WebP ${(processed.size / 1024).toFixed(1)}KB (${wasOptimized ? 'optimized' : 'same size'})`,
    );

    // Step 6: Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${processed.format}`;
    const path = `${userId}/${filename}`;

    // Step 7: Upload processed image to Supabase
    const { error } = await this.supabase.storage.from(this.bucket).upload(
      path,
      processed.buffer,
      {
        contentType: `image/${processed.format}`,
        cacheControl: 'public, max-age=31536000', // 1 year cache
        upsert: false,
      },
    );

    if (error) {
      this.logger.error(`❌ Upload failed: ${error.message}`);
      throw new InternalServerErrorException('خطا در آپلود تصویر');
    }

    // Step 8: Get public URL
    const { data: urlData } = this.supabase.storage.from(this.bucket).getPublicUrl(path);

    if (!urlData?.publicUrl) {
      throw new InternalServerErrorException('خطا در دریافت URL تصویر');
    }

    this.logger.log(`✅ Image uploaded: ${urlData.publicUrl}`);

    return {
      url: urlData.publicUrl,
      path,
      size: processed.size,
      mimeType: `image/${processed.format}`,
      width: processed.width,
      height: processed.height,
      optimized: wasOptimized,
      originalSize,
    };
  }

  /**
   * Delete image from storage
   */
  async deleteImage(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
    if (error) {
      this.logger.warn(`⚠️ Failed to delete image ${path}: ${error.message}`);
    } else {
      this.logger.log(`🗑️ Image deleted: ${path}`);
    }
  }
}
