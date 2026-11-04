import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    default: 30,
    minimum: 7,
    maximum: 90,
    description: 'تعداد روزهای نمودار درآمد/رزرو',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days باید عدد صحیح باشد' })
  @Min(7, { message: 'days حداقل ۷ است' })
  @Max(90, { message: 'days حداکثر ۹۰ است' })
  days?: number = 30;
}
