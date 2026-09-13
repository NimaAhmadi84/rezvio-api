import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO افزودن تعطیلات بازه‌ای (Phase 23)
 *
 * کاربرد:
 * - تعطیلات نوروز (۱۳ روز)
 * - مسافرت صاحب کسب‌وکار (یک هفته)
 * - مریضی طولانی‌مدت
 *
 * قوانین:
 * - startDate و endDate باید ISO 8601 (YYYY-MM-DD) باشن
 * - startDate باید قبل یا مساوی endDate باشه
 * - حداکثر بازه: ۹۰ روز (جلوگیری از اشتباه owner)
 * - تاریخ‌های تکراری (قبلاً تعطیل‌شده) به صورت خودکار skip می‌شن
 */
export class CreateBatchHolidayDto {
  @ApiProperty({
    description: 'شناسه کسب‌وکار',
    example: 'c987d8cf-c360-4190-9b25-0584222f14f6',
  })
  @IsString({ message: 'شناسه کسب‌وکار باید رشته باشد' })
  businessId!: string;

  @ApiProperty({
    description: 'تاریخ شروع بازه (YYYY-MM-DD)',
    example: '2026-03-20',
  })
  @IsDateString(
    { strict: false },
    { message: 'تاریخ شروع باید به فرمت YYYY-MM-DD باشد' },
  )
  startDate!: string;

  @ApiProperty({
    description: 'تاریخ پایان بازه (YYYY-MM-DD، شامل خود روز)',
    example: '2026-04-02',
  })
  @IsDateString(
    { strict: false },
    { message: 'تاریخ پایان باید به فرمت YYYY-MM-DD باشد' },
  )
  endDate!: string;

  @ApiPropertyOptional({
    description: 'دلیل تعطیلی (اختیاری — برای همه روزها یکسان)',
    example: 'تعطیلات نوروز',
  })
  @IsString({ message: 'دلیل باید رشته باشد' })
  @IsOptional()
  reason?: string;
}