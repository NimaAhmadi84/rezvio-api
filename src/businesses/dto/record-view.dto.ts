import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordViewDto {
  @ApiProperty({ description: 'شناسه یکتای بازدیدکننده از localStorage' })
  @IsString()
  visitorId!: string;
}