import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { PermissionGuard } from './guards/permission.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { AdminBookingsService } from './admin-bookings.service';
import { QueryAdminBookingsDto } from './dto/query-admin-bookings.dto';
import { AdminCancelBookingDto } from './dto/admin-cancel-booking.dto';
import { UpdateBookingStatusDto } from '../bookings/dto/update-booking-status.dto';

@ApiTags('Admin — Bookings')
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AdminBookingsController {
  constructor(private readonly adminBookingsService: AdminBookingsService) {}

  @Get()
  @RequirePermissions('booking:view')
  @ApiOperation({ summary: 'لیست همه‌ی رزروها (cross-business)' })
  findAll(@Query() dto: QueryAdminBookingsDto) {
    return this.adminBookingsService.findAll(dto);
  }

  @Get(':id')
  @RequirePermissions('booking:view')
  @ApiOperation({ summary: 'جزئیات یک رزرو' })
  @ApiResponse({ status: 404, description: 'رزرو یافت نشد' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUserDto,
  ) {
    return this.adminBookingsService.findOne(id, admin.id);
  }

  @Patch(':id/status')
  @RequirePermissions('booking:change-status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'تغییر وضعیت رزرو' })
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.adminBookingsService.changeStatus(id, dto, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/cancel')
  @RequirePermissions('booking:cancel')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'لغو رزرو توسط ادمین (با دلیل)' })
  cancelWithReason(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminCancelBookingDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.adminBookingsService.cancelWithReason(id, dto.reason, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
