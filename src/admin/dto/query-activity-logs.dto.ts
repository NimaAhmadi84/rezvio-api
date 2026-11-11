import {
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const TARGET_TYPES = ['User', 'Booking', 'Business', 'Admin', 'AdminRole'] as const;

/**
 * QueryActivityLogsDto — فیلتر + pagination برای Audit Log
 */
export class QueryActivityLogsDto {
  @ApiPropertyOptional({ description: 'جستجو در action، نام ادمین، یا targetId' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'user.ban' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: 'فیلتر بر اساس ادمین' })
  @IsOptional()
  @IsUUID('4')
  adminId?: string;

  @ApiPropertyOptional({ enum: TARGET_TYPES })
  @IsOptional()
  @IsIn(TARGET_TYPES as unknown as string[])
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  targetId?: string;

  @ApiPropertyOptional({ description: 'از تاریخ (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'تا تاریخ (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}