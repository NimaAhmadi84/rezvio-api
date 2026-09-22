import { IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailChangeDto {
  @ApiProperty({
    example: '123456',
    description: 'کد تایید ۶ رقمی ارسال شده به ایمیل جدید',
  })
  @IsString()
  @Length(6, 6, { message: 'کد تایید باید دقیقاً ۶ رقم باشد' })
  @Matches(/^\d{6}$/, { message: 'کد تایید باید فقط شامل ارقام باشد' })
  code!: string;

  @ApiProperty({
    example: 'newemail@example.com',
    description: 'ایمیل جدیدی که کد به آن ارسال شد (الزامی — OTP فقط برای همین identifier معتبر است)',
  })
  @IsString({ message: 'ایمیل جدید الزامی است' })
  @MaxLength(254, { message: 'ایمیل بیش از حد طولانی است (حداکثر ۲۵۴ کاراکتر)' })
  @Matches(/^[^\s]*$/, { message: 'ایمیل نباید شامل فاصله باشد' })
  newEmail!: string;
}