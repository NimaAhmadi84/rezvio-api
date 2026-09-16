import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StaffDateBreakDto {
  @ApiProperty({
    description: 'تاریخ روز غیبت به فرمت YYYY-MM-DD',
    example: '2026-09-17',
  })
  @IsString({ message: 'تاریخ باید رشته باشد' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاریخ باید به فرمت YYYY-MM-DD باشد (مثلاً 2026-09-17)',
  })
  date!: string;

  @ApiProperty({ description: 'ساعت شروع به فرمت HH:MM', example: '10:00' })
  @IsString({ message: 'ساعت شروع باید رشته باشد' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'ساعت شروع باید به فرمت HH:MM باشد (مثلاً 10:00)',
  })
  startTime!: string;

  @ApiProperty({ description: 'ساعت پایان به فرمت HH:MM', example: '11:00' })
  @IsString({ message: 'ساعت پایان باید رشته باشد' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'ساعت پایان باید به فرمت HH:MM باشد (مثلاً 11:00)',
  })
  endTime!: string;

  @ApiProperty({
    description: 'دلیل غیبت (اختیاری)',
    example: 'کار بانکی',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'دلیل باید رشته باشد' })
  @MaxLength(100, { message: 'دلیل نمی‌تواند بیش از ۱۰۰ کاراکتر باشد' })
  reason?: string;
}

export class CreateStaffDateBreaksDto {
  @ApiProperty({
    description: 'لیست کامل غیبت‌های موردی (جایگزین کامل لیست قبلی)',
    type: [StaffDateBreakDto],
  })
  @IsArray({ message: 'لیست غیبت‌ها باید آرایه باشد' })
  @ArrayMaxSize(60, { message: 'حداکثر ۶۰ غیبت موردی مجاز است' })
  @ValidateNested({ each: true })
  @Type(() => StaffDateBreakDto)
  breaks!: StaffDateBreakDto[];
}