import { IsString, MinLength, MaxLength, IsOptional, Matches, IsUrl, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessDto {
  @ApiProperty({ example: 'آرایشگاه علی', description: 'نام کسب‌وکار' })
  @IsString()
  @MinLength(2, { message: 'نام کسب‌وکار باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام کسب‌وکار نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

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

  @ApiPropertyOptional({
    example: 'آرایشگاه مدرن با بیش از ۱۰ سال سابقه در ارائه خدمات اصلاح و پیرایش مردانه',
    description: 'توضیحات کسب‌وکار (اختیاری)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: 'توضیحات نباید بیش از ۲۰۰۰ کاراکتر باشد' })
  description?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/logo.png',
    description: 'URL لوگو یا عکس کسب‌وکار (اختیاری)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'URL لوگو نباید بیش از ۵۰۰ کاراکتر باشد' })
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'ID دسته‌بندی کسب‌وکار',
    example: 'uuid-of-category',
  })
  @IsUUID('4', { message: 'ID دسته‌بندی نامعتبر است' })
  @IsOptional()
  categoryId?: string;

}
