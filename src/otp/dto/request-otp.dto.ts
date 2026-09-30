import { IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({ example: 'user@example.com', description: 'ایمیل یا شماره تماس' })
  @IsString({ message: 'شناسه باید رشته باشد' })
  @MaxLength(254, { message: 'شناسه خیلی طولانی است' })
  @Matches(/^[^\r\n\t]+$/, {
    message: 'شناسه نباید شامل کاراکترهای کنترلی باشد',
  })
  identifier!: string;
}
