import { IsInt, IsString, Min, Max, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * UpdateSiteReviewDto — ویرایش نظر کاربر (ویرایش کامل)
 *
 * ویرایش نظر وضعیتش را دوباره به PENDING برمی‌گرداند
 * (برای بررسی مجدد توسط ادمین).
 */
export class UpdateSiteReviewDto {
  @ApiProperty({
    description: 'امتیاز جدید از ۱ تا ۵ (ستاره)',
    example: 4,
    minimum: 1,
    maximum: 5,
  })
  @IsInt({ message: 'امتیاز باید عدد صحیح باشد' })
  @Min(1, { message: 'حداقل امتیاز ۱ است' })
  @Max(5, { message: 'حداکثر امتیاز ۵ است' })
  rating!: number;

  @ApiPropertyOptional({
    description: 'عنوان نظر (اختیاری)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'عنوان باید رشته باشد' })
  @MaxLength(100, { message: 'عنوان نمی‌تواند بیش از ۱۰۰ کاراکتر باشد' })
  title?: string;

  @ApiProperty({
    description: 'متن نظر جدید',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString({ message: 'متن نظر باید رشته باشد' })
  @MinLength(10, { message: 'متن نظر باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(1000, { message: 'متن نظر نمی‌تواند بیش از ۱۰۰۰ کاراکتر باشد' })
  text!: string;
}
