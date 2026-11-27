import { IsInt, IsString, Min, Max, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * CreateSiteReviewDto — ثبت نظر کاربر درباره خود سایت رزویو
 *
 * هر کاربر فقط یک نظر دارد (unique constraint در DB).
 * نظر پس از ثبت در وضعیت PENDING قرار می‌گیرد و پس از بررسی ادمین نمایش عمومی می‌یابد.
 */
export class CreateSiteReviewDto {
  @ApiProperty({
    description: 'امتیاز از ۱ تا ۵ (ستاره)',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt({ message: 'امتیاز باید عدد صحیح باشد' })
  @Min(1, { message: 'حداقل امتیاز ۱ است' })
  @Max(5, { message: 'حداکثر امتیاز ۵ است' })
  rating!: number;

  @ApiPropertyOptional({
    description: 'عنوان نظر (اختیاری)',
    example: 'تجربه‌ی عالی',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'عنوان باید رشته باشد' })
  @MaxLength(100, { message: 'عنوان نمی‌تواند بیش از ۱۰۰ کاراکتر باشد' })
  title?: string;

  @ApiProperty({
    description: 'متن نظر شما درباره سایت',
    example: 'سایت رزویو تجربه‌ی رزرو بسیار راحتی داشت و همه‌چیز سریع و شفاف بود.',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString({ message: 'متن نظر باید رشته باشد' })
  @MinLength(10, { message: 'متن نظر باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(1000, { message: 'متن نظر نمی‌تواند بیش از ۱۰۰۰ کاراکتر باشد' })
  text!: string;
}
