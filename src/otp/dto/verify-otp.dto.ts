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
}
