import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * RejectSiteReviewDto — دلیل رد نظر (اختیاری)
 *
 * دلیل به نظردهنده اطلاع داده می‌شود (در اعلان و خروجی «نظر من»).
 */
export class RejectSiteReviewDto {
  @ApiPropertyOptional({
    description: 'دلیل رد نظر (اختیاری، حداکثر ۲۵۵ کاراکتر)',
    example: 'محتوای پیشنهاد تبلیغ دارد',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'دلیل باید رشته باشد' })
  @MaxLength(255, { message: 'دلیل رد نمی‌تواند بیش از ۲۵۵ کاراکتر باشد' })
  reason?: string;
}
