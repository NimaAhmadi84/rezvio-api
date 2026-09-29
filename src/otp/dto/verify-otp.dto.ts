import { IsString, IsOptional, IsBoolean, IsEmail, Length, Matches, MinLength, MaxLength } from 'class-validator';

const IRAN_PHONE_REGEX = /^09\d{9}$/;
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  @MaxLength(254, { message: 'شناسه بیش از حد طولانی است' })
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

  @ApiPropertyOptional({ example: '09123456789', description: 'شماره تماس (برای ذخیره در ثبت‌نام)' })
  @IsOptional()
  @IsString()
  @Matches(IRAN_PHONE_REGEX, { message: 'شماره موبایل باید با ۰۹ شروع و ۱۱ رقم باشد' })
  phone?: string;

  @ApiPropertyOptional({ example: 'user@example.com', description: 'ایمیل (برای ذخیره در ثبت‌نام)' })
  @IsOptional()
  @IsEmail({}, { message: 'فرمت ایمیل صحیح نیست' })
  email?: string;

  @ApiPropertyOptional({ example: 'StrongPass123' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(64, { message: 'رمز عبور نباید بیش از ۶۴ کاراکتر باشد' })
  password?: string;

  @ApiPropertyOptional({ example: false, description: 'اگر true باشد، refresh token برای ۳۰ روز معتبر است (پیش‌فرض: ۱ روز)' })
  @IsOptional()
  @IsBoolean({ message: 'rememberMe باید boolean باشد' })
  rememberMe?: boolean;
}
