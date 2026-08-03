import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHolidayDto {
  @ApiProperty({ description: 'شناسه کسب‌وکار' })
  @IsString()
  businessId!: string;

  @ApiProperty({ example: '2026-08-15', description: 'تاریخ تعطیلی (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'تاریخ باید به فرمت YYYY-MM-DD باشد' })
  date!: string;

  @ApiPropertyOptional({ example: 'عید فطر' })
  @IsString()
  @IsOptional()
  reason?: string;
}
