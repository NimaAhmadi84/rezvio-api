import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketCategory, TicketPriority } from '@prisma/client';

/**
 * CreateTicketDto — ایجاد تیکت جدید توسط کاربر
 *
 * initialMessage: پیام اولیه در همان تراکنش به TicketMessage تبدیل می‌شود
 * (senderType = USER, isInternal = false)
 *
 * relatedType/relatedId فعلاً در DB موجود است ولی در API نمایش داده نمی‌شود
 * (Phase 27.5 — link to booking/business)
 */
export class CreateTicketDto {
  @ApiProperty({
    description: 'موضوع تیکت (۳ تا ۲۰۰ کاراکتر)',
    example: 'مشکل در رزرو نوبت',
  })
  @IsString()
  @MinLength(3, { message: 'موضوع تیکت حداقل ۳ کاراکتر است' })
  @MaxLength(200, { message: 'موضوع تیکت حداکثر ۲۰۰ کاراکتر است' })
  subject!: string;

  @ApiPropertyOptional({
    enum: TicketCategory,
    default: TicketCategory.GENERAL,
    description: 'دسته‌بندی تیکت',
  })
  @IsOptional()
  @IsEnum(TicketCategory, { message: 'دسته‌بندی نامعتبر است' })
  category?: TicketCategory;

  @ApiPropertyOptional({
    enum: TicketPriority,
    default: TicketPriority.NORMAL,
    description: 'اولویت تیکت',
  })
  @IsOptional()
  @IsEnum(TicketPriority, { message: 'اولویت نامعتبر است' })
  priority?: TicketPriority;

  @ApiProperty({
    description: 'متن پیام اولیه (۱ تا ۵۰۰۰ کاراکتر)',
    example: 'سلام، هنگام رزرو نوبت برای ساعت ۱۰ صبح خطا می‌گیرم.',
  })
  @IsString()
  @MinLength(1, { message: 'متن پیام الزامی است' })
  @MaxLength(5000, { message: 'متن پیام حداکثر ۵۰۰۰ کاراکتر است' })
  initialMessage!: string;
}