import { IsString, IsOptional, Length, Matches, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  identifier!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'کد باید ۶ رقم باشد' })
  @Matches(/^\d{6}$/, { message: 'کد باید فقط شامل ۶ رقم باشد' })
  code!: string;

  @ApiPropertyOptional({ example: 'علی احمدی', description: 'نام (فقط هنگام ثبت‌نام)' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'نام باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '09123456789', description: 'شماره تماس (الزامی برای ثبت‌نام)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'StrongPass123' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  password?: string;
}
