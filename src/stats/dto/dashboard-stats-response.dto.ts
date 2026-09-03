import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsResponseDto {
  @ApiProperty({ example: 3, description: 'تعداد کل کسب‌وکارهای کاربر' })
  totalBusinesses!: number;

  @ApiProperty({ example: 2, description: 'تعداد رزروهای امروز' })
  todayBookings!: number;

  @ApiProperty({ example: 8, description: 'تعداد رزروهای این هفته (۷ روز آینده)' })
  weekBookings!: number;

  @ApiProperty({ example: 1, description: 'تعداد رزروهای در انتظار تأیید' })
  pendingBookings!: number;

  @ApiProperty({ example: 47, description: 'تعداد کل رزروها' })
  totalBookings!: number;
}