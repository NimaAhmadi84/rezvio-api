import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

import { AvailabilityService } from './availability.service';
import { CreateBusinessHourDto } from './dto/create-business-hour.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ============================================
  // Business Hours Endpoints
  // ============================================

  @Post('hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تنظیم ساعات کاری کسب‌وکار (جایگزینی کامل)' })
  setBusinessHours(
    @CurrentUser() user: AuthUserDto,
    @Body() dto: CreateBusinessHourDto,
  ) {
    return this.availabilityService.setBusinessHours(user.id, dto);
  }

  @Get('hours/:businessId')
  @ApiOperation({ summary: 'دریافت ساعات کاری کسب‌وکار (عمومی)' })
  getBusinessHours(@Param('businessId', new ParseUUIDPipe()) businessId: string) {
    return this.availabilityService.getBusinessHours(businessId);
  }

  @Delete('hours/:businessId/:dayOfWeek')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف ساعت کاری یک روز خاص' })
  removeBusinessHour(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.availabilityService.removeBusinessHour(businessId, dayOfWeek, user.id);
  }

  // ============================================
  // Holidays Endpoints
  // ============================================

  @Post('holidays')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'افزودن تعطیلی' })
  addHoliday(@CurrentUser() user: AuthUserDto, @Body() dto: CreateHolidayDto) {
    return this.availabilityService.addHoliday(user.id, dto);
  }

  @Get('holidays/:businessId')
  @ApiOperation({ summary: 'دریافت لیست تعطیلات (عمومی)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'تاریخ شروع (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'تاریخ پایان (YYYY-MM-DD)' })
  getHolidays(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.availabilityService.getHolidays(businessId, startDate, endDate);
  }

  @Delete('holidays/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف تعطیلی' })
  removeHoliday(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.availabilityService.removeHoliday(id, user.id);
  }
}
