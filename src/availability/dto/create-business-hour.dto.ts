import { IsInt, IsString, IsArray, ValidateNested, Min, Max, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BusinessHourDto {
  @ApiProperty({ example: 0, description: 'روز هفته (0=شنبه, 6=جمعه)' })
  @IsInt({ message: 'روز هفته باید عدد صحیح باشد' })
  @Min(0, { message: 'روز هفته باید حداقل 0 باشد' })
  @Max(6, { message: 'روز هفته باید حداکثر 6 باشد' })
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00', description: 'ساعت شروع کار (HH:MM)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'ساعت شروع باید به فرمت HH:MM باشد' })
  openTime!: string;

  @ApiProperty({ example: '21:00', description: 'ساعت پایان کار (HH:MM)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'ساعت پایان باید به فرمت HH:MM باشد' })
  closeTime!: string;
}

export class CreateBusinessHourDto {
  @ApiProperty({ description: 'شناسه کسب‌وکار' })
  @IsString()
  businessId!: string;

  @ApiProperty({ type: [BusinessHourDto], description: 'لیست ساعات کاری' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  hours!: BusinessHourDto[];
}
