import { IsString, IsDateString, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SlotsQueryDto {
  @ApiProperty({ description: 'شناسه خدمت', example: 'uuid-of-service' })
  @IsUUID('4', { message: 'serviceId باید UUID معتبر باشد' })
  serviceId!: string;

  @ApiProperty({ description: 'شناسه کارمند', example: 'uuid-of-staff' })
  @IsUUID('4', { message: 'staffId باید UUID معتبر باشد' })
  staffId!: string;

  @ApiProperty({ description: 'تاریخ (YYYY-MM-DD)', example: '2026-08-15' })
  @IsDateString({}, { message: 'تاریخ باید به فرمت YYYY-MM-DD باشد' })
  date!: string;
}
