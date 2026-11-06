import {
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';

/**
 * فیلتر و pagination برای لیست کاربران (پنل ادمین)
 */
export class QueryAdminUsersDto {
  @ApiPropertyOptional({ description: 'جستجو در نام/ایمیل/تلفن' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'عبارت جستجو نباید بیش از ۱۰۰ کاراکتر باشد' })
  q?: string;

  @ApiPropertyOptional({
    description: 'فیلتر نقش',
    enum: UserRole,
  })
  @IsOptional()
  @IsIn(['CUSTOMER', 'OWNER', 'ADMIN'], { message: 'نقش نامعتبر است' })
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'فیلتر مسدود شده',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'isBanned باید true یا false باشد' })
  isBanned?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد' })
  @Min(1, { message: 'page باید حداقل ۱ باشد' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد' })
  @Min(1)
  @Max(100, { message: 'limit نمی‌تواند بیش از ۱۰۰ باشد' })
  limit?: number = 20;
}
