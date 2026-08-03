import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

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

  @Get('business/:businessId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت رزروهای کسب‌وکار (فقط مالک)' })
  @ApiResponse({ status: 200, description: 'لیست رزروهای کسب‌وکار' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  findBusinessBookings(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.bookingsService.findBusinessBookings(businessId, user.id);
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
