import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: BookingStatus,
    description: 'وضعیت جدید رزرو',
    example: BookingStatus.CONFIRMED,
  })
  @IsEnum(BookingStatus, { message: 'وضعیت رزرو نامعتبر است' })
  status!: BookingStatus;
}
