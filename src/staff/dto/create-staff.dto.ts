import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStaffDto {
  @ApiProperty({
    example: 'علی احمدی',
    description: 'نام و نام خانوادگی کارمند',
  })
  @IsString()
  @MinLength(2, { message: 'نام و نام خانوادگی باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, {
    message: 'نام و نام خانوادگی نباید بیش از ۱۰۰ کاراکتر باشد',
  })
  name!: string;

  @ApiPropertyOptional({ example: 'ali@example.com' })
  @IsEmail({}, { message: 'ایمیل نامعتبر است' })
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: '09121234567',
    description: 'شماره موبایل کارمند (اجباری)',
  })
  @IsString()
  @Matches(/^09\d{9}$/, {
    message: 'شماره موبایل باید به فرمت ۰۹۱۲۳۴۵۶۷۸۹ باشد',
  })
  phone!: string;

  @ApiProperty({ description: 'شناسه کسب‌وکار' })
  @IsString()
  businessId!: string;
}