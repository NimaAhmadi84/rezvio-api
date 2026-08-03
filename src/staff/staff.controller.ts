import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Staff')
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ساخت کارمند جدید (فقط مالک business)' })
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'دریافت لیست کارکنان (می‌توان با businessId فیلتر کرد)' })
  @ApiQuery({ name: 'businessId', required: false })
  findAll(@Query('businessId') businessId?: string) {
    return this.staffService.findAll(businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'دریافت کارمند با ID' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.staffService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'آپدیت کارمند (فقط مالک business)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف کارمند (فقط مالک business)' })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.staffService.remove(id, user.id);
  }
}
