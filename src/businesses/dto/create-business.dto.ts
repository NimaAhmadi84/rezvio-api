import { IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessDto {
  @ApiProperty({ example: 'آرایشگاه علی', description: 'نام کسب‌وکار' })
  @IsString()
  @MinLength(2, { message: 'نام کسب‌وکار باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام کسب‌وکار نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

  /**
   * آدرس اختصاصی (اختیاری - SEO-friendly)
   *
   * در صورت ارائه، این مقدار به عنوان slug استفاده می‌شه.
   * در صورت عدم ارائه، از نام ساخته می‌شه (با fallback به nanoid برای فارسی).
   *
   * قوانین:
   * - فقط حروف کوچک انگلیسی (a-z)، اعداد (0-9) و - مجاز
   * - حداقل ۳ و حداکثر ۵۰ کاراکتر
   * - نمی‌تونه با - شروع یا تموم بشه
   *
   * مثال خوب: nima-barber, ali-salon-2026, beauty-tehran
   * مثال بد: Nima-Barber (حروف بزرگ), علی_آرایشگاه (فارسی)
   */
  @ApiPropertyOptional({
    example: 'nima-barber',
    description: 'آدرس اختصاصی (اختیاری). فقط حروف کوچک انگلیسی، اعداد و - مجاز است',
  })
  @IsString()
  @IsOptional()
  @MinLength(3, { message: 'آدرس اختصاصی باید حداقل ۳ کاراکتر باشد' })
  @MaxLength(50, { message: 'آدرس اختصاصی نباید بیش از ۵۰ کاراکتر باشد' })
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'آدرس اختصاصی فقط می‌تواند شامل حروف کوچک انگلیسی، اعداد و - باشد (بدون - پشت سر هم و بدون - در ابتدا/انتها)',
  })
  customSlug?: string;

  @ApiPropertyOptional({ example: 'تهران، خیابان ولیعصر، پلاک ۱۲۳' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'آدرس نباید بیش از ۵۰۰ کاراکتر باشد' })
  address?: string;

  @ApiPropertyOptional({ example: '02112345678' })
  @IsString()
  @IsOptional()
  phone?: string;
}
