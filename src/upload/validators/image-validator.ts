/**
 * Magic Bytes Validator + Resolution Check
 * اعتبارسنجی دقیق تصاویر:
 * 1. Magic bytes (فرمت واقعی فایل)
 * 2. Resolution (حداقل 200×200)
 */

import sharp from 'sharp';

// Magic bytes signatures
const MAGIC_BYTES = {
  jpeg: {
    bytes: [0xff, 0xd8, 0xff],
    mime: 'image/jpeg',
    ext: 'jpg',
  },
  png: {
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    mime: 'image/png',
    ext: 'png',
  },
  webp: {
    bytes: [0x52, 0x49, 0x46, 0x46],
    mime: 'image/webp',
    ext: 'webp',
  },
};

export interface ImageValidationResult {
  valid: boolean;
  mime?: string;
  ext?: string;
  width?: number;
  height?: number;
  error?: string;
}

export const MIN_WIDTH = 200;
export const MIN_HEIGHT = 200;
export const MAX_DIMENSION = 2048;

/**
 * Validates image using magic bytes
 */
export function validateImageMagicBytes(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'فایل خالی یا ناقص است' };
  }

  const bytes = Array.from(buffer.slice(0, 12));

  if (matchesSignature(bytes, MAGIC_BYTES.jpeg.bytes)) {
    return { valid: true, mime: MAGIC_BYTES.jpeg.mime, ext: MAGIC_BYTES.jpeg.ext };
  }

  if (matchesSignature(bytes, MAGIC_BYTES.png.bytes)) {
    return { valid: true, mime: MAGIC_BYTES.png.mime, ext: MAGIC_BYTES.png.ext };
  }

  if (
    matchesSignature(bytes, MAGIC_BYTES.webp.bytes) &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, mime: MAGIC_BYTES.webp.mime, ext: MAGIC_BYTES.webp.ext };
  }

  return {
    valid: false,
    error: 'فرمت فایل نامعتبر است. فقط JPEG، PNG و WebP مجاز هستند.',
  };
}

function matchesSignature(fileBytes: number[], signature: number[]): boolean {
  if (fileBytes.length < signature.length) return false;
  return signature.every((byte, index) => fileBytes[index] === byte);
}

/**
 * Check file size
 */
export function validateImageSize(buffer: Buffer, maxBytes: number): ImageValidationResult {
  if (buffer.length > maxBytes) {
    return {
      valid: false,
      error: `حجم فایل بیش از حد مجاز است (حداکثر ${Math.round(maxBytes / 1024 / 1024)}MB)`,
    };
  }
  return { valid: true };
}

/**
 * Get image dimensions and validate minimum resolution
 * @param buffer - Image buffer
 * @returns Metadata with width/height
 */
export async function validateImageResolution(
  buffer: Buffer,
): Promise<ImageValidationResult> {
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'خطا در خواندن ابعاد تصویر' };
    }

    if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      return {
        valid: false,
        error: `کیفیت تصویر پایین است. حداقل ابعاد مجاز ${MIN_WIDTH}×${MIN_HEIGHT} پیکسل است (تصویر شما: ${metadata.width}×${metadata.height})`,
        width: metadata.width,
        height: metadata.height,
      };
    }

    return {
      valid: true,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    return { valid: false, error: 'فایل تصویر خراب یا نامعتبر است' };
  }
}
