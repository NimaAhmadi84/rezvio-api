import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,  // ← این باید باشه
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
  constructor(private readonly bookingsService: BookingsService) { }

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
    const validDays = isNaN(parsedDays) || parsedDays < 1 ? 7 : Math.min(parsedDays, 30);
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
}
