import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({ example: 'user@example.com', description: 'ایمیل یا شماره تماس' })
  @IsString({ message: 'شناسه باید رشته باشد' })
  @MaxLength(100, { message: 'شناسه خیلی طولانی است' })
  identifier!: string;
}
