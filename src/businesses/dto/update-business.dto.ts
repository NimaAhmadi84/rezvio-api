import { IsString, MinLength, MaxLength, IsOptional, Matches, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

}
