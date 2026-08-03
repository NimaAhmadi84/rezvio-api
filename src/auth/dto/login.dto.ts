import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'owner@reservino.ir' })
  @IsEmail({}, { message: 'ایمیل وارد شده نامعتبر است' })
  email!: string;

  @ApiProperty({ example: 'owner123' })
  @IsString()
  @MinLength(1, { message: 'رمز عبور نمی‌تواند خالی باشد' })
  password!: string;
}
