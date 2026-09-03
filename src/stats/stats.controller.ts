import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300000)
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
   * آمار داشبورد برای OWNER/ADMIN
   * 
   * حل N+1 Problem: همه رزروهای owner رو در یک query می‌گیره
   * و aggregated stats رو برمی‌گردونه.
   * 
   * Cache: 60 ثانیه (کمتر از landing چون real-time بودن مهمه)
   */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60000)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'آمار داشبورد برای صاحب کسب‌وکار',
    description:
      'آمار aggregated از همه کسب‌وکارهای owner: تعداد رزروهای امروز، هفته، در انتظار تأیید، و کل.',
  })
  @ApiResponse({
    status: 200,
    description: 'آمار داشبورد',
    schema: {
      type: 'object',
      properties: {
        totalBusinesses: { type: 'number', example: 3 },
        todayBookings: { type: 'number', example: 2 },
        weekBookings: { type: 'number', example: 8 },
        pendingBookings: { type: 'number', example: 1 },
        totalBookings: { type: 'number', example: 47 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'فقط OWNER/ADMIN مجاز است' })
  getDashboardStats(@CurrentUser() user: AuthUserDto) {
    return this.statsService.getDashboardStats(user.id);
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