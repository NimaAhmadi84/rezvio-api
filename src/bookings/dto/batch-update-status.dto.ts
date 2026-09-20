import { IsArray, IsEnum, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class BatchUpdateStatusDto {
  @ApiProperty({
    description: 'لیست UUID رزروها (حداکثر ۵۰)',
    type: [String],
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @IsArray({ message: 'bookingIds باید یک آرایه باشد' })
  @ArrayMinSize(1, { message: 'حداقل یک رزرو باید انتخاب شود' })
  @ArrayMaxSize(50, { message: 'حداکثر ۵۰ رزرو در هر درخواست مجاز است' })
  bookingIds!: string[];

  @ApiProperty({
    description: 'وضعیت جدید (فقط CONFIRMED یا CANCELLED)',
    enum: ['CONFIRMED', 'CANCELLED'],
    example: 'CONFIRMED',
  })
  @IsEnum(['CONFIRMED', 'CANCELLED'], {
    message: 'وضعیت باید CONFIRMED یا CANCELLED باشد',
  })
  status!: 'CONFIRMED' | 'CANCELLED';
}