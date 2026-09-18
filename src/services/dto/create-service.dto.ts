import { IsString, IsInt, IsNumber, IsOptional, MinLength, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty({ example: 'اصلاح مو', description: 'نام خدمت' })
  @IsString()
  @MinLength(2, { message: 'نام خدمت باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام خدمت نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

  @ApiPropertyOptional({ example: 'اصلاح موی سر با مدل دلخواه' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'توضیحات نباید بیش از ۵۰۰ کاراکتر باشد' })
  description?: string;

  @ApiProperty({ example: 30, description: 'مدت زمان خدمت (دقیقه)' })
  @IsInt({ message: 'مدت زمان باید عدد صحیح باشد' })
  @Min(5, { message: 'مدت زمان باید حداقل ۵ دقیقه باشد' })
  durationMinutes!: number;

  @ApiProperty({ example: 150000, description: 'قیمت خدمت (تومان)' })
  @IsNumber({}, { message: 'قیمت باید عدد باشد' })
  @Min(10000, { message: 'حداقل قیمت ۱۰,۰۰۰ تومان است' })
  @Max(1000000000, { message: 'حداکثر قیمت ۱,۰۰۰,۰۰۰,۰۰۰ تومان است' })
  price!: number;

  @ApiProperty({ description: 'شناسه کسب‌وکار' })
  @IsString()
  businessId!: string;
}
