import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  identifier!: string;

  @ApiProperty({ example: '123456' })
  @IsString({ message: 'کد باید رشته باشد' })
  @Length(6, 6, { message: 'کد باید ۶ رقم باشد' })
  @Matches(/^\d{6}$/, { message: 'کد باید فقط شامل ۶ رقم باشد' })
  code!: string;
}
