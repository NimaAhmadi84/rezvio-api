import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminCancelBookingDto {
  @ApiProperty({
    description: 'دلیل لغو (حداقل ۵ کاراکتر) — در Audit Log ثبت می‌شود',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
