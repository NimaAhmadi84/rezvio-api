import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';

/**
 * QueryTicketsDto — فیلتر + pagination برای لیست تیکت‌های خود کاربر
 *
 * نکته: userId در service از req.user.id خوانده می‌شود
 *   (کاربر نمی‌تواند تیکت‌های دیگران را ببیند)
 */
export class QueryTicketsDto {
  @ApiPropertyOptional({
    enum: TicketStatus,
    description: 'فیلتر بر اساس وضعیت',
  })
  @IsOptional()
  @IsEnum(TicketStatus, { message: 'وضعیت نامعتبر است' })
  status?: TicketStatus;

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