import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { StaffBreaksService } from './staff-breaks.service';
import { SetStaffBreaksDto } from './dto/set-staff-breaks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Staff Breaks')
@Controller('availability/staff-breaks')
export class StaffBreaksController {
  constructor(private readonly staffBreaksService: StaffBreaksService) {}

  @Get(':staffId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'دریافت بازه‌های غیرقابل رزرو یک کارمند',
    description: 'لیست تمام بازه‌های غیرقابل رزرو کارمند (مرتب‌شده بر اساس روز هفته و ساعت شروع)',
  })
  @ApiResponse({
    status: 200,
    description: 'لیست بازه‌ها',
    schema: {
      example: [
        {
          id: 'uuid',
          staffId: 'uuid',
          dayOfWeek: 0,
          startTime: '13:00',
          endTime: '16:00',
          createdAt: '2026-09-15T10:00:00Z',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  @ApiResponse({ status: 404, description: 'کارمند یافت نشد' })
  getBreaks(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.staffBreaksService.getBreaks(staffId, user.id);
  }

  @Post(':staffId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'جایگزینی کامل بازه‌های غیرقابل رزرو کارمند',
    description:
      'تمام بازه‌های قبلی حذف و breaks جدید جایگزین می‌شوند. بدنه درخواست باید آرایه‌ای از بازه‌ها باشد. overlap بین بازه‌ها خطا می‌دهد.',
  })
  @ApiResponse({
    status: 201,
    description: 'بازه‌ها با موفقیت ذخیره شدند',
  })
  @ApiResponse({ status: 400, description: 'بازه‌های نامعتبر یا overlap' })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  @ApiResponse({ status: 404, description: 'کارمند یافت نشد' })
  setBreaks(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: SetStaffBreaksDto,
  ) {
    return this.staffBreaksService.setBreaks(staffId, user.id, dto.breaks);
  }
}