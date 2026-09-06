import { IsString, Length, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: '0012345678',
    description: 'کد ملی ۱۰ رقمی (فقط یک‌بار قابل ثبت)',
  })
  @IsString()
  @IsOptional()
  @Length(10, 10, { message: 'کد ملی باید دقیقاً ۱۰ رقم باشد' })
  @Matches(/^\d{10}$/, { message: 'کد ملی باید فقط شامل ارقام باشد' })
  nationalId?: string;
}