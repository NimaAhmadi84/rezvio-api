import { IsOptional, IsInt, IsString, Min, Max, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * QuerySiteReviewsDto — فیلتر + مرتب‌سازی + pagination برای لیست نظرات
 *
 * در لیست عمومی فقط نظرات APPROVED نمایش داده می‌شود
 * (service فیلتر status را اجباری می‌کند). در لیست ادمین، فیلتر status فعال است.
 */
export class QuerySiteReviewsDto {
  @ApiPropertyOptional({
    description: 'فیلتر بر اساس وضعیت (فقط برای لیست ادمین)',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'], {
    message: 'وضعیت باید یکی از: PENDING, APPROVED, REJECTED باشد',
  })
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'فیلتر بر اساس ستاره (۱ تا ۵)', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'فیلتر ستاره باید عدد صحیح باشد' })
  @Min(1, { message: 'حداقل ستاره ۱ است' })
  @Max(5, { message: 'حداکثر ستاره ۵ است' })
  rating?: number;

  @ApiPropertyOptional({
    description: 'مرتب‌سازی',
    enum: ['newest', 'highest', 'lowest'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'highest', 'lowest'], {
    message: 'مرتب‌سازی باید یکی از: newest, highest, lowest باشد',
  })
  sort?: 'newest' | 'highest' | 'lowest';

  @ApiPropertyOptional({ description: 'جست‌وجو در متن نظر یا نام نظردهنده' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'شماره صفحه', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'تعداد در صفحه (حداکثر ۵۰)', default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * QueryAdminSiteReviewsDto — فیلتر لیست ادمین (همان QuerySiteReviewsDto + UUID فیلتر)
 * برای سادگی، همان DTO اصلی با محدودیت ۵۰ مورد استفاده می‌شود.
 */
export class QueryAdminSiteReviewsDto extends QuerySiteReviewsDto {
  @ApiPropertyOptional({ description: 'فیلتر بر اساس کاربر (User.id)' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;
}
