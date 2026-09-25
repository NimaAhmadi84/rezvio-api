import { IsEmail, IsEnum, IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

// نام باید یک‌دست باشد: کاملاً فارسی یا کاملاً انگلیسی (ترکیبی ممنوع)
const NAME_SCRIPT_REGEX = /^([\u0621-\u064A\u0671-\u06CC\s\u200C]+|[A-Za-z\s'-]+)$/;

// ایمیل سخت‌گیرانه (RFC 5322 dot-atom + دامنه معتبر)
const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'ایمیل معتبر' })
  @IsEmail({}, { message: 'ایمیل وارد شده نامعتبر است' })
  @MaxLength(254, { message: 'ایمیل بیش از حد طولانی است (حداکثر ۲۵۴ کاراکتر)' })
  @Matches(/^[^\s]*$/, { message: 'ایمیل نباید شامل فاصله باشد' })
  @Matches(STRICT_EMAIL_REGEX, {
    message: 'فرمت ایمیل معتبر نیست (مثال: you@gmail.com)',
  })
  email!: string;

  @ApiProperty({ example: 'علی احمدی', description: 'نام کاربر (کاملاً فارسی یا کاملاً انگلیسی)' })
  @IsString({ message: 'نام باید رشته باشد' })
  @MinLength(3, { message: 'نام باید حداقل ۳ کاراکتر باشد' })
  @MaxLength(60, { message: 'نام نباید بیش از ۶۰ کاراکتر باشد' })
  @Matches(/^[^\d]*$/, { message: 'نام نباید شامل عدد باشد' })
  @Matches(/^[^!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]*$/, {
    message: 'نام نباید شامل علامت‌های خاص (@، #، !، * و...) باشد',
  })
  @Matches(NAME_SCRIPT_REGEX, {
    message: 'نام باید کاملاً فارسی یا کاملاً انگلیسی باشد (ترکیبی ممنوع)',
  })
  name!: string;

  @ApiProperty({
    example: 'StrongPass123!',
    description: 'رمز عبور قوی (حداقل ۸ کاراکتر، شامل حرف بزرگ، کوچک، عدد و نماد)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(64, { message: 'رمز عبور نباید بیش از ۶۴ کاراکتر باشد' })
  @Matches(/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/, {
    message: 'رمز عبور باید فقط شامل حروف انگلیسی، اعداد و نمادها باشد',
  })
  @Matches(/[A-Z]/, { message: 'رمز عبور باید حداقل یک حرف بزرگ انگلیسی (A-Z) داشته باشد' })
  @Matches(/[a-z]/, { message: 'رمز عبور باید حداقل یک حرف کوچک انگلیسی (a-z) داشته باشد' })
  @Matches(/[0-9]/, { message: 'رمز عبور باید حداقل یک عدد (0-9) داشته باشد' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, {
    message: 'رمز عبور باید حداقل یک نماد خاص (!@#$%...) داشته باشد',
  })
  password!: string;

  @ApiProperty({ enum: UserRole, default: UserRole.CUSTOMER, required: false })
  @IsOptional()
  @IsEnum(UserRole, { message: 'نقش انتخابی نامعتبر است' })
  role?: UserRole;

  @ApiPropertyOptional({ description: 'توکن hCaptcha برای جلوگیری از ربات‌ها' })
  @IsOptional()
  @IsString({ message: 'کد امنیتی باید رشته باشد' })
  captchaToken?: string;
}