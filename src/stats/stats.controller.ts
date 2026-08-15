import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * آمار عمومی برای landing page
   * بدون نیاز به auth - قابل cache شدن
   */
  @Get('landing')
  @ApiOperation({
    summary: 'آمار عمومی landing page',
    description:
      'آمار کلی سیستم برای نمایش در landing page (تعداد کسب‌وکارها، رزروها، شهرها و...). عمومی و قابل cache.',
  })
  @ApiResponse({
    status: 200,
    description: 'آمار landing page',
    schema: {
      type: 'object',
      properties: {
        businessesCount: { type: 'number', example: 500 },
        bookingsCount: { type: 'number', example: 10000 },
        activeCities: { type: 'number', example: 31 },
        categoriesCount: { type: 'number', example: 12 },
        activeOwners: { type: 'number', example: 150 },
        averageRating: { type: 'number', example: 4.9 },
      },
    },
  })
  getLandingStats() {
    return this.statsService.getLandingStats();
  }

  /**
   * آمار admin dashboard (فقط ADMIN)
   */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'آمار admin dashboard',
    description: 'آمار کامل سیستم فقط برای ادمین کل',
  })
  @ApiResponse({ status: 200, description: 'آمار admin' })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'فقط ادمین مجاز است' })
  getAdminStats() {
    return this.statsService.getAdminStats();
  }
}
