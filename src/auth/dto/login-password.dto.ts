import { IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'ایمیل یا شماره تماس' })
  @IsString({ message: 'شناسه باید رشته باشد' })
  @MaxLength(100)
  identifier!: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString({ message: 'رمز باید رشته باشد' })
  @MinLength(8, { message: 'رمز باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: false, description: 'اگر true باشد، refresh token برای ۳۰ روز معتبر است (پیش‌فرض: ۱ روز)' })
  @IsOptional()
  @IsBoolean({ message: 'rememberMe باید boolean باشد' })
  rememberMe?: boolean;
}
