import { IsString, MinLength, MaxLength, IsOptional, IsNumber, IsUUID, ValidateNested, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SocialMediaLinkDto } from './social-media-link.dto';

export class UpdateBusinessDto {
  @ApiPropertyOptional({ example: 'آرایشگاه علی (بروزشده)' })
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'نام کسب‌وکار باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام کسب‌وکار نباید بیش از ۱۰۰ کاراکتر باشد' })
  name?: string;

  @ApiPropertyOptional({ example: 'تهران، خیابان ولیعصر، پلاک ۴۵۶' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'آدرس نباید بیش از ۵۰۰ کاراکتر باشد' })
  address?: string;

  @ApiPropertyOptional({ example: '02187654321' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'توضیحات بروزشده درباره کسب‌وکار' })
  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: 'توضیحات نباید بیش از ۲۰۰۰ کاراکتر باشد' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/new-logo.png' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'URL لوگو نباید بیش از ۵۰۰ کاراکتر باشد' })
  logoUrl?: string;

  @ApiPropertyOptional({
    example: 'uuid-of-category',
    description: 'ID دسته‌بندی کسب‌وکار (اختیاری)',
  })
  @IsUUID('4', { message: 'ID دسته‌بندی نامعتبر است' })
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'تهران',
    description: 'استان',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'نام استان نباید بیش از ۱۰۰ کاراکتر باشد' })
  province?: string;

  @ApiPropertyOptional({
    example: 'تهران',
    description: 'شهر',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'نام شهر نباید بیش از ۱۰۰ کاراکتر باشد' })
  city?: string;

  @ApiPropertyOptional({
    example: 35.6892,
    description: 'عرض جغرافیایی',
  })
  @IsNumber({}, { message: 'latitude باید عدد باشد' })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({
    example: 51.3890,
    description: 'طول جغرافیایی',
  })
  @IsNumber({}, { message: 'longitude باید عدد باشد' })
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    example: 'https://neshan.org/...',
    description: 'لینک نقشه (نشان/بله)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'لینک نقشه نباید بیش از ۱۰۰۰ کاراکتر باشد' })
  mapLink?: string;

  @ApiPropertyOptional({
    description: 'لیست شبکه‌های اجتماعی (حداکثر ۸ تا)',
    type: [SocialMediaLinkDto],
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SocialMediaLinkDto)
  @ArrayMaxSize(8, { message: 'حداکثر ۸ شبکه اجتماعی مجاز است' })
  socialMedia?: SocialMediaLinkDto[];

}
