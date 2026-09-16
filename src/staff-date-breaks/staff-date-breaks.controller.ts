import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StaffDateBreaksService } from './staff-date-breaks.service';
import { CreateStaffDateBreaksDto } from './dto/create-staff-date-breaks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Staff Date Breaks')
@Controller('availability/staff-date-breaks')
export class StaffDateBreaksController {
  constructor(private readonly staffDateBreaksService: StaffDateBreaksService) {}

  @Get(':staffId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'دریافت غیبت‌های موردی کارمند (تاریخ خاص)',
  })
  getBreaks(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.staffDateBreaksService.getBreaks(staffId, user.id);
  }

  @Post(':staffId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'جایگزینی کامل غیبت‌های موردی کارمند',
    description:
      'لیست قبلی حذف و لیست جدید جایگزین می‌شود. اعتبارسنجی: تاریخ آینده، بدون تداخل، حداقل ۱۰ دقیقه.',
  })
  setBreaks(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: CreateStaffDateBreaksDto,
  ) {
    return this.staffDateBreaksService.setBreaks(staffId, user.id, dto.breaks);
  }
}