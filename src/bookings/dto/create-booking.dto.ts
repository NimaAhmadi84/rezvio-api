import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ description: 'شناسه کسب‌وکار', example: 'uuid' })
  @IsUUID('4', { message: 'businessId باید UUID معتبر باشد' })
  businessId!: string;

  @ApiProperty({ description: 'شناسه خدمت', example: 'uuid' })
  @IsUUID('4', { message: 'serviceId باید UUID معتبر باشد' })
  serviceId!: string;

  @ApiProperty({ description: 'شناسه کارمند', example: 'uuid' })
  @IsUUID('4', { message: 'staffId باید UUID معتبر باشد' })
  staffId!: string;

  @ApiProperty({ description: 'تاریخ و ساعت شروع رزرو', example: '2026-08-05T14:00:00' })
  @IsDateString({}, { message: 'startTime باید به فرمت ISO 8601 باشد' })
  startTime!: string;

  @ApiPropertyOptional({ description: 'یادداشت برای رزرو', example: 'لطفاً راس ساعت بیایم' })
  @IsString()
  @IsOptional()
  notes?: string;
}
