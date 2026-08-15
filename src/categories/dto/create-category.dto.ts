import { IsString, IsOptional, IsInt, Min, Max, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'نام دسته‌بندی (فارسی)',
    example: 'آرایشگاه مردانه',
  })
  @IsString({ message: 'نام باید رشته متنی باشد' })
  @MinLength(2, { message: 'نام باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام نباید بیش از ۱۰۰ کاراکتر باشد' })
  name: string;

  @ApiProperty({
    description: 'اسلاگ URL (انگلیسی، lowercase، فقط a-z و اعداد و -)',
    example: 'barber',
  })
  @IsString({ message: 'اسلاگ باید رشته متنی باشد' })
  @MinLength(2, { message: 'اسلاگ باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(50, { message: 'اسلاگ نباید بیش از ۵۰ کاراکتر باشد' })
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، اعداد و - باشد',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'آیکون (emoji یا نام آیکون)',
    example: '✂️',
  })
  @IsString({ message: 'آیکون باید رشته متنی باشد' })
  @IsOptional()
  @MaxLength(10, { message: 'آیکون نباید بیش از ۱۰ کاراکتر باشد' })
  icon?: string;

  @ApiPropertyOptional({
    description: 'ترتیب نمایش (کوچکتر = بالاتر)',
    example: 1,
    default: 0,
  })
  @IsInt({ message: 'ترتیب باید عدد صحیح باشد' })
  @IsOptional()
  @Min(0, { message: 'ترتیب نباید منفی باشد' })
  @Max(999, { message: 'ترتیب نباید بیش از ۹۹۹ باشد' })
  sortOrder?: number;
}
