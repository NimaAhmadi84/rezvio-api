import { IsString, MinLength, MaxLength, IsOptional, IsPhoneNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessDto {
  @ApiProperty({ example: 'آرایشگاه علی', description: 'نام کسب‌وکار' })
  @IsString()
  @MinLength(2, { message: 'نام کسب‌وکار باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(100, { message: 'نام کسب‌وکار نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

  @ApiPropertyOptional({ example: 'تهران، خیابان ولیعصر، پلاک ۱۲۳' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'آدرس نباید بیش از ۵۰۰ کاراکتر باشد' })
  address?: string;

  @ApiPropertyOptional({ example: '02112345678' })
  @IsString()
  @IsOptional()
  phone?: string;
}
