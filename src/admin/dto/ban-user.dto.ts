import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({
    description: 'دلیل مسدود کردن کاربر (حداقل ۵ کاراکتر)',
    example: 'تخلف از قوانین و ارسال محتوای نامناسب',
  })
  @IsString({ message: 'دلیل مسدودسازی الزامی است' })
  @MinLength(5, { message: 'دلیل مسدودسازی باید حداقل ۵ کاراکتر باشد' })
  @MaxLength(500, { message: 'دلیل مسدودسازی نباید بیش از ۵۰۰ کاراکتر باشد' })
  reason!: string;
}
