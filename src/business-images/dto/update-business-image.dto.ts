import { IsString, IsOptional, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBusinessImageDto {
  @ApiPropertyOptional({
    example: 'محیط داخلی آرایشگاه (اصلاح شده)',
    description: 'توضیحات جدید تصویر',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'توضیحات تصویر نباید بیش از ۲۰۰ کاراکتر باشد' })
  caption?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'ترتیب جدید نمایش',
  })
  @IsNumber({}, { message: 'sortOrder باید عدد باشد' })
  @IsOptional()
  @Min(0, { message: 'sortOrder نباید منفی باشد' })
  sortOrder?: number;
}