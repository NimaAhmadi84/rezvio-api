import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { IncomeStatsQueryDto } from './dto/income-stats-query.dto';
import { BatchUpdateStatusDto } from './dto/batch-update-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';
import { QueryBookingsDto } from './dto/query-bookings.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ═══════════════════════════════════════════════════════════════
  // Static routes (باید قبل از :id باشن تا NestJS درست match کنه)
  // ═══════════════════════════════════════════════════════════════

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ایجاد رزرو جدید (همه کاربران احراز هویت شده)' })
  @ApiResponse({ status: 201, description: 'رزرو با موفقیت ایجاد شد' })
  @ApiResponse({ status: 409, description: 'زمان رزرو تداخل دارد' })
  @ApiResponse({ status: 400, description: 'داده‌های ورودی نامعتبر' })
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.id, dto);
  }

  @Get('my-bookings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت رزروهای من (مشتری)' })
  @ApiResponse({ status: 200, description: 'لیست رزروهای کاربر' })
  findMyBookings(@CurrentUser() user: AuthUserDto) {
    return this.bookingsService.findMyBookings(user.id);
  }

  /**
   * دریافت رزروهای پیش‌رو برای OWNER
   *
   * حل N+1 Problem: همه رزروهای آینده owner از همه کسب‌وکارهاش رو
   * در یک request برمی‌گردونه.
   *
   * @param days - تعداد روز آینده (optional, default 7)
   */
  @Get('upcoming')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'رزروهای پیش‌رو برای صاحب کسب‌وکار',
    description:
      'همه رزروهای آینده owner از همه کسب‌وکارهاش. شامل customer, service, staff, business.',
  })
  @ApiResponse({
    status: 200,
    description: 'لیست رزروهای پیش‌رو',
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'فقط OWNER/ADMIN مجاز است' })
  getUpcomingBookings(
    @CurrentUser() user: AuthUserDto,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? parseInt(days, 10) : 7;
    const validDays =
      isNaN(parsedDays) || parsedDays < 1 ? 7 : Math.min(parsedDays, 30);
    return this.bookingsService.getUpcomingForOwner(user.id, validDays);
  }

  @Get('business/:businessId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'دریافت رزروهای کسب‌وکار با فیلتر + pagination + stats',
    description:
      'بازه حداکثر ۳۱ روز. درآمد فقط از COMPLETED. Stats روی کل بازه (مستقل از صفحه).',
  })
  @ApiResponse({ status: 200, description: 'لیست رزروها + meta + stats' })
  @ApiResponse({ status: 400, description: 'بازه بیش از ۳۱ روز' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  findBusinessBookings(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @CurrentUser() user: AuthUserDto,
    @Query() query: QueryBookingsDto,
  ) {
    return this.bookingsService.findBusinessBookings(businessId, user.id, query);
  }

  /**
   * آمار درآمد تجمیعی OWNER — همه کسب‌وکارها در یک بازه (Phase 22)
   *
   * خروجی:
   *   - revenue: درآمد کل (فقط COMPLETED)
   *   - completed: تعداد کل رزروهای تکمیل‌شده
   *   - businesses: تفکیک per کسب‌وکار
   *
   * Query params:
   *   - from: ISO 8601 (optional — پیش‌فرض ۳۰ روز گذشته)
   *   - to: ISO 8601 (optional — پیش‌فرض امروز)
   *
   * حداکثر بازه: ۳۶۵ روز
   *
   * ⚠️ IMPORTANT: این route باید قبل از :id باشه تا NestJS درست match کنه
   */
  @Get('income-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'آمار درآمد تجمیعی OWNER (همه کسب‌وکارها)',
    description:
      'درآمد کل و تفکیک per کسب‌وکار در بازه زمانی. فقط COMPLETED محاسبه می‌شود.',
  })
  @ApiResponse({ status: 200, description: 'آمار درآمد با موفقیت دریافت شد' })
  @ApiResponse({ status: 400, description: 'بازه بیش از ۳۶۵ روز' })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'فقط OWNER/ADMIN مجاز است' })
  getOwnerIncomeStats(
    @CurrentUser() user: AuthUserDto,
    @Query() query: IncomeStatsQueryDto,
  ) {
    return this.bookingsService.getOwnerIncomeStats(user.id, query);
  }

  /**
   * Batch update status برای چند رزرو همزمان (Owner/Admin only)
   *
   * - فقط CONFIRMED یا CANCELLED مجاز است
   * - حداکثر ۵۰ رزرو در هر درخواست
   * - Ownership validation برای همه رزروها
   * - Atomic transaction برای همه updates
   */
  @Patch('batch/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'تغییر وضعیت چند رزرو همزمان (Batch)',
    description:
      'فقط CONFIRMED یا CANCELLED مجاز است. حداکثر ۵۰ رزرو در هر درخواست. فقط Owner/Admin.',
  })
  @ApiResponse({ status: 200, description: 'لیست رزروهای آپدیت شده' })
  @ApiResponse({ status: 400, description: 'خطای اعتبارسنجی یا transition نامجاز' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  @ApiResponse({ status: 404, description: 'برخی رزروها یافت نشدند' })
  batchUpdateStatus(
    @CurrentUser() user: AuthUserDto,
    @Body() dto: BatchUpdateStatusDto,
  ) {
    return this.bookingsService.batchUpdateStatus(user.id, user.role, dto);
  }

  // ═══════════════════════════════════════════════════════════════
  // Dynamic routes (:id) — باید آخر باشن
  // ═══════════════════════════════════════════════════════════════

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت جزئیات رزرو' })
  @ApiResponse({ status: 200, description: 'جزئیات رزرو' })
  @ApiResponse({ status: 404, description: 'رزرو یافت نشد' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر وضعیت رزرو' })
  @ApiResponse({ status: 200, description: 'وضعیت رزرو تغییر کرد' })
  @ApiResponse({ status: 400, description: 'تغییر وضعیت مجاز نیست' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatus(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'لغو رزرو' })
  @ApiResponse({ status: 200, description: 'رزرو لغو شد' })
  @ApiResponse({ status: 400, description: 'لغو رزرو مجاز نیست' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.bookingsService.cancel(id, user.id, user.role);
  }

  /**
   * لغو رزرو با علت — مخصوص مشتری (Phase 22)
   *
   * چرا endpoint جدا از DELETE /:id؟
   *   - DELETE /:id برای owner و admin هم کاربرد داره (بدون reason)
   *   - این endpoint فقط برای customer است و reason رو ذخیره می‌کنه
   *   - فقط رزروهای PENDING و CONFIRMED قابل لغو با reason هستن
   */
  @Patch(':id/cancel-with-reason')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'لغو رزرو با علت (فقط مشتری)',
    description:
      'مشتری باید علت لغو را بنویسد (حداقل ۱۰ و حداکثر ۵۰۰ کاراکتر). فقط رزروهای PENDING یا CONFIRMED قابل لغو هستند.',
  })
  @ApiResponse({ status: 200, description: 'رزرو با موفقیت لغو شد' })
  @ApiResponse({ status: 400, description: 'علت نامعتبر یا وضعیت غیرقابل لغو' })
  @ApiResponse({ status: 403, description: 'شما مالک این رزرو نیستید' })
  @ApiResponse({ status: 404, description: 'رزرو یافت نشد' })
  cancelWithReason(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelWithReason(id, user.id, dto);
  }
}