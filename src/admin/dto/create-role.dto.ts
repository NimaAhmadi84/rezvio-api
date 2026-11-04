import {
  IsString, IsOptional, IsArray, MinLength, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: 'نام نقش (یکتا)' })
  @IsString()
  @MinLength(2, { message: 'نام نقش حداقل ۲ کاراکتر' })
  @MaxLength(50, { message: 'نام نقش حداکثر ۵۰ کاراکتر' })
  name!: string;

  @ApiPropertyOptional({ description: 'توضیحات' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    description: 'آرایه‌ای از کدهای مجوز',
    example: ['booking:view', 'user:view'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}
