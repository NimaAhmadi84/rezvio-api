import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * ReplyTicketDto — پاسخ به تیکت (هم کاربر هم ادمین از همین DTO استفاده می‌کنند)
 *
 * ⚠️ نکته امنیتی: isInternal فقط برای ادمین‌ها honored است.
 *   اگر کاربر isInternal=true بفرستد، service با 400 رد می‌کند
 *   (senderType === 'USER' && isInternal → BadRequestException)
 */
export class ReplyTicketDto {
  @ApiProperty({
    description: 'متن پاسخ (۱ تا ۵۰۰۰ کاراکتر)',
    example: 'سلام، لطفاً یک بار دیگر تلاش کنید.',
  })
  @IsString()
  @MinLength(1, { message: 'متن پاسخ الزامی است' })
  @MaxLength(5000, { message: 'متن پاسخ حداکثر ۵۰۰۰ کاراکتر است' })
  text!: string;

  @ApiPropertyOptional({
    description: 'یادداشت داخلی (فقط ادمین). کاربر نمی‌تواند true بفرستد.',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isInternal باید boolean باشد' })
  isInternal?: boolean;
}