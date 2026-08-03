import { IsEmail, IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'ایمیل معتبر' })
  @IsEmail({}, { message: 'ایمیل وارد شده نامعتبر است' })
  email!: string;

  @ApiProperty({ example: 'علی احمدی', description: 'نام کاربر' })
  @IsString({ message: 'نام باید رشته باشد' })
  @MinLength(2, { message: 'نام باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

  @ApiProperty({
    example: 'StrongPass123!',
    description: 'رمز عبور (حداقل ۸ کاراکتر، شامل حروف و اعداد)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(128, { message: 'رمز عبور نباید بیش از ۱۲۸ کاراکتر باشد' })
  password!: string;

  @ApiProperty({ enum: UserRole, default: UserRole.CUSTOMER, required: false })
  @IsEnum(UserRole, { message: 'نقش انتخابی نامعتبر است' })
  role?: UserRole;
}
