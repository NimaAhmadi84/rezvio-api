import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStaffDto {
  @ApiProperty({ example: 'علی احمدی', description: 'نام کارمند' })
  @IsString()
  @MinLength(2, { message: 'نام کارمند باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام کارمند نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

  @ApiPropertyOptional({ example: 'ali@example.com' })
  @IsEmail({}, { message: 'ایمیل نامعتبر است' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '09121234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'شناسه کسب‌وکار' })
  @IsString()
  businessId!: string;
}
