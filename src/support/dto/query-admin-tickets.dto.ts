import {
  IsOptional,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from '@prisma/client';

/**
 * QueryAdminTicketsDto — فیلتر پیشرفته برای ادمین
 *
 * q: جستجو در subject + نام/ایمیل کاربر سازنده
 */
export class QueryAdminTicketsDto {
  @ApiPropertyOptional({
    description: 'جستجو در موضوع یا نام/ایمیل کاربر',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus, { message: 'وضعیت نامعتبر است' })
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority, { message: 'اولویت نامعتبر است' })
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory, { message: 'دسته‌بندی نامعتبر است' })
  category?: TicketCategory;

  @ApiPropertyOptional({ description: 'فیلتر بر اساس ادمین تخصیص‌یافته' })
  @IsOptional()
  @IsUUID('4')
  assignedAdminId?: string;

  @ApiPropertyOptional({ description: 'فیلتر بر اساس کاربر سازنده' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}