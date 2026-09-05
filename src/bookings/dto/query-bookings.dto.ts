import {
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO فیلتر و pagination رزروها
 *
 * منطق:
 * - from/to: بازه زمانی حداکثر ۳۱ روز (اعتبارسنجی در service)
 * - status: ALL (همه) یا یکی از enum ها
 * - q: جستجو در نام مشتری/خدمت/کارمند/تلفن (case-insensitive)
 * - page: 1 به بالا
 * - limit: 1-100 (پیش‌فرض 20 — برای فشار ندادن به سرور)
 */
export class QueryBookingsDto {
  @ApiPropertyOptional({
    description: 'تاریخ شروع (ISO). پیش‌فرض: ۳۰ روز پیش',
    example: '2026-08-06',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'فرمت تاریخ from باید ISO باشد (مثل 2026-08-06)' },
  )
  from?: string;

  @ApiPropertyOptional({
    description: 'تاریخ پایان (ISO). پیش‌فرض: امروز',
    example: '2026-09-05',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'فرمت تاریخ to باید ISO باشد (مثل 2026-09-05)' },
  )
  to?: string;

  @ApiPropertyOptional({
    description:
      'فیلتر وضعیت: ALL | PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW',
    example: 'ALL',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'جستجو در نام مشتری/خدمت/کارمند/تلفن',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1, description: 'شماره صفحه (از ۱)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد' })
  @Min(1, { message: 'page باید حداقل ۱ باشد' })
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description: 'تعداد آیتم‌ها در هر صفحه (حداکثر ۱۰۰)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد' })
  @Max(100, { message: 'limit نمی‌تواند بیش از ۱۰۰ باشد (حفاظت از سرور)' })
  limit?: number = 20;
}