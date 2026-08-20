/**
 * Image Processor
 * پردازش حرفه‌ای تصاویر برای بهترین کیفیت ممکن:
 * - Auto-rotate از EXIF
 * - تبدیل به WebP با quality 85 (بهینه‌ترین نقطه)
 * - Resize هوشمند (max 2048px)
 * - Strip metadata (حریم خصوصی + کاهش حجم)
 */

import sharp from 'sharp';
import { MAX_DIMENSION } from '../validators/image-validator';

export interface ProcessedImage {
  buffer: Buffer;
  format: 'webp' | 'jpeg';
  width: number;
  height: number;
  size: number;
}

/**
 * Process image for optimal quality + size
 * @param buffer - Original image buffer
 * @returns Processed image buffer (WebP preferred)
 */
export async function processBusinessLogo(buffer: Buffer): Promise<ProcessedImage> {
  // دریافت ابعاد اصلی برای تصمیم‌گیری resize
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // شروع pipeline پردازش
  let pipeline = sharp(buffer)
    // Auto-rotate از EXIF (خیلی مهم برای موبایل)
    .rotate();

  // Smart resize: فقط اگر بزرگتر از MAX_DIMENSION بود، کوچک کن
  if (originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside', // حفظ نسبت ابعاد (aspect ratio)
      withoutEnlargement: true, // کوچک کردن نه بزرگ کردن
      kernel: sharp.kernel.lanczos3, // بهترین کیفیت resize (downscale)
    });
  }

  // تبدیل به WebP با quality 85 (بهینه‌ترین نقطه: کیفیت + حجم)
  const webpBuffer = await pipeline
    .webp({
      quality: 85,
      effort: 4, // سطح تلاش برای فشرده‌سازی (1-6, بالاتر = بهتر ولی کندتر)
    })
    .toBuffer();

  // دریافت metadata نهایی
  const finalMetadata = await sharp(webpBuffer).metadata();

  return {
    buffer: webpBuffer,
    format: 'webp',
    width: finalMetadata.width || 0,
    height: finalMetadata.height || 0,
    size: webpBuffer.length,
  };
}
