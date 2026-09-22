import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'ایمیل یا شماره موبایل ثبت‌شده',
  })
  @IsString({ message: 'شناسه باید رشته باشد' })
  @MinLength(3, { message: 'شناسه بیش از حد کوتاه است' })
  @MaxLength(254, { message: 'شناسه بیش از حد طولانی است' })
  identifier!: string;
}
