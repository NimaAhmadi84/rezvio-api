import {
  IsOptional,
  IsString,
  IsIn,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryAdminBookingsDto {
  @ApiPropertyOptional({ description: 'جستجو در نام/ایمیل/تلفن مشتری، خدمت، کارمند، کسب‌وکار' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
  status?: string;

  @ApiPropertyOptional({ description: 'فیلتر کسب‌وکار' })
  @IsOptional()
  @IsUUID('4')
  businessId?: string;

  @ApiPropertyOptional({ description: 'فیلتر مشتری' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ description: 'فیلتر کارمند' })
  @IsOptional()
  @IsUUID('4')
  staffId?: string;

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

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
