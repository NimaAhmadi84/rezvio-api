import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// همان الگوی سخت‌گیرانه RegisterDto برای رمز عبور
const PASSWORD_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/;

export class ResetPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'ایمیل یا شماره موبایلی که OTP به آن ارسال شده',
  })
  @IsString({ message: 'شناسه باید رشته باشد' })
  @MinLength(3, { message: 'شناسه بیش از حد کوتاه است' })
  @MaxLength(254, { message: 'شناسه بیش از حد طولانی است' })
  identifier!: string;

  @ApiProperty({
    example: '123456',
    description: 'کد تأیید ۶ رقمی ارسال‌شده',
  })
  @IsString({ message: 'کد تأیید باید رشته باشد' })
  @MinLength(6, { message: 'کد تأیید باید دقیقاً ۶ رقم باشد' })
  @MaxLength(6, { message: 'کد تأیید باید دقیقاً ۶ رقم باشد' })
  @Matches(/^\d{6}$/, { message: 'کد تأیید باید فقط شامل ارقام باشد' })
  code!: string;

  @ApiProperty({
    example: 'StrongPass123!',
    description: 'رمز عبور جدید (حداقل ۸ کاراکتر، شامل حرف بزرگ، کوچک، عدد و نماد)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(64, { message: 'رمز عبور نباید بیش از ۶۴ کاراکتر باشد' })
  @Matches(PASSWORD_REGEX, {
    message: 'رمز عبور باید فقط شامل حروف انگلیسی، اعداد و نمادها باشد',
  })
  @Matches(/[A-Z]/, { message: 'رمز عبور باید حداقل یک حرف بزرگ انگلیسی داشته باشد' })
  @Matches(/[a-z]/, { message: 'رمز عبور باید حداقل یک حرف کوچک انگلیسی داشته باشد' })
  @Matches(/[0-9]/, { message: 'رمز عبور باید حداقل یک عدد داشته باشد' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, {
    message: 'رمز عبور باید حداقل یک نماد خاص داشته باشد',
  })
  password!: string;
}
