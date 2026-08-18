import { IsOptional, IsString, IsInt, Min, Max, IsUUID, Matches, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchBusinessesDto {
  @ApiPropertyOptional({
    description: 'جستجو در نام کسب‌وکار',
    example: 'آرایشگاه',
  })
  @IsString({ message: 'عبارت جستجو باید رشته متنی باشد' })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description: 'فیلتر بر اساس شهر (بخشی از آدرس)',
    example: 'تهران',
  })
  @IsString({ message: 'شهر باید رشته متنی باشد' })
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'فیلتر بر اساس ID دسته‌بندی',
    example: 'uuid-of-category',
  })
  @IsUUID('4', { message: 'ID دسته‌بندی نامعتبر است' })
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'مرتب‌سازی',
    enum: ['newest', 'popular', 'most-viewed', 'name-asc', 'name-desc'],
    default: 'newest',
  })
  @IsString({ message: 'sort باید رشته متنی باشد' })
  @IsOptional()
  @Matches(/^(newest|popular|most-viewed|name-asc|name-desc)$/, {
    message: 'sort باید یکی از: newest, popular, most-viewed, name-asc, name-desc باشد',
  })
  sort?: string;

  @ApiPropertyOptional({
    description: 'فیلتر کسب‌وکارهای ساخته‌شده بعد از این تاریخ (ISO 8601) - برای تب جدیدترین',
    example: '2026-02-18T00:00:00.000Z',
  })
  @IsDateString({}, { message: 'since باید یک تاریخ معتبر ISO 8601 باشد' })
  @IsOptional()
  since?: string;

  @ApiPropertyOptional({
    description: 'شماره صفحه (از 1 شروع می‌شود)',
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد' })
  @Min(1, { message: 'page باید حداقل 1 باشد' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'تعداد آیتم در هر صفحه',
    default: 12,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد' })
  @Min(1, { message: 'limit باید حداقل 1 باشد' })
  @Max(100, { message: 'limit نباید بیش از 100 باشد' })
  @IsOptional()
  limit?: number;
}
