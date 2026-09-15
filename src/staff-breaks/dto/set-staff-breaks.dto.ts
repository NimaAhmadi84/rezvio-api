import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StaffBreakDto {
  @ApiProperty({
    description: 'روز هفته (۰=شنبه ... ۶=جمعه)',
    example: 0,
    minimum: 0,
    maximum: 6,
  })
  @IsInt({ message: 'روز هفته باید عدد صحیح باشد' })
  @Min(0, { message: 'روز هفته نمی‌تواند کمتر از ۰ باشد' })
  @Max(6, { message: 'روز هفته نمی‌تواند بیشتر از ۶ باشد' })
  dayOfWeek!: number;

  @ApiProperty({
    description: 'ساعت شروع به فرمت HH:MM',
    example: '13:00',
  })
  @IsString({ message: 'ساعت شروع باید رشته باشد' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'ساعت شروع باید به فرمت HH:MM باشد (مثلاً 13:00)',
  })
  startTime!: string;

  @ApiProperty({
    description: 'ساعت پایان به فرمت HH:MM',
    example: '16:00',
  })
  @IsString({ message: 'ساعت پایان باید رشته باشد' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'ساعت پایان باید به فرمت HH:MM باشد (مثلاً 16:00)',
  })
  endTime!: string;
}

export class SetStaffBreaksDto {
  @ApiProperty({
    description: 'لیست بازه‌های غیرقابل رزرو (جایگزین کامل)',
    type: [StaffBreakDto],
    example: [
      { dayOfWeek: 0, startTime: '13:00', endTime: '16:00' },
      { dayOfWeek: 2, startTime: '14:00', endTime: '15:00' },
    ],
  })
  @IsArray({ message: 'لیست بازه‌ها باید آرایه باشد' })
  @ArrayMaxSize(35, { message: 'حداکثر ۳۵ بازه مجاز است (۵ بازه × ۷ روز)' })
  @ValidateNested({ each: true })
  @Type(() => StaffBreakDto)
  breaks!: StaffBreakDto[];
}