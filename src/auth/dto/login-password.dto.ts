import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'ایمیل یا شماره تماس' })
  @IsString({ message: 'شناسه باید رشته باشد' })
  @MaxLength(100)
  identifier!: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString({ message: 'رمز باید رشته باشد' })
  @MinLength(8, { message: 'رمز باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(128)
  password!: string;
}
