import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh Token معتبر' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh Token نمی‌تواند خالی باشد' })
  refreshToken!: string;
}
