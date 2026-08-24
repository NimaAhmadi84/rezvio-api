import { IsString, IsOptional, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessImageDto {
  @ApiProperty({
    example: 'https://xxx.supabase.co/storage/v1/object/public/business-logos/user-id/image.webp',
    description: 'URL تصویر (از endpoint آپلود دریافت شده)',
  })
  @IsString()
  @MaxLength(500, { message: 'URL تصویر نباید بیش از ۵۰۰ کاراکتر باشد' })
  url!: string;

  @ApiPropertyOptional({
    example: 'محیط داخلی آرایشگاه',
    description: 'توضیحات تصویر (اختیاری)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'توضیحات تصویر نباید بیش از ۲۰۰ کاراکتر باشد' })
  caption?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'ترتیب نمایش (عدد کوچکتر = اولویت بالاتر)',
    default: 0,
  })
  @IsNumber({}, { message: 'sortOrder باید عدد باشد' })
  @IsOptional()
  @Min(0, { message: 'sortOrder نباید منفی باشد' })
  sortOrder?: number;
}