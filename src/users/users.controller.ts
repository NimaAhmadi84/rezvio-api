import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeNameDto } from './dto/change-name.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ساخت کاربر جدید (فقط ادمین)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت لیست همه کاربران (فقط ادمین)' })
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * دریافت اطلاعات کاربر فعلی — مستقیم از دیتابیس
   * شامل nationalId و phone (برای نمایش در پروفایل)
   * ⚠️ باید قبل از :id تعریف شود
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت اطلاعات کاربر فعلی (با nationalId)' })
  @ApiResponse({ status: 200, description: 'اطلاعات کاربر' })
  @ApiResponse({ status: 401, description: 'احراز هویت نشده' })
  getMe(@CurrentUser() user: AuthUserDto) {
    return this.usersService.findOne(user.id);
  }

  /**
   * آپدیت پروفایل کاربر (nationalId — یک‌بار ثبت)
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'آپدیت پروفایل کاربر (nationalId — یک‌بار ثبت)' })
  updateProfile(@CurrentUser() user: AuthUserDto, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  /**
   * تغییر نام کاربر
   */
  @Patch('name')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر نام کاربر' })
  changeName(@CurrentUser() user: AuthUserDto, @Body() dto: ChangeNameDto) {
    return this.usersService.changeName(user.id, dto.name);
  }

  /**
   * درخواست تغییر ایمیل (ارسال OTP به ایمیل جدید)
   */
  @Post('request-email-change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'درخواست تغییر ایمیل (ارسال OTP به ایمیل جدید)' })
  requestEmailChange(@CurrentUser() user: AuthUserDto, @Body() dto: RequestEmailChangeDto) {
    return this.usersService.requestEmailChange(user.id, dto.newEmail);
  }

  /**
   * تایید تغییر ایمیل با OTP
   */
  @Post('confirm-email-change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تایید تغییر ایمیل با OTP' })
  confirmEmailChange(@CurrentUser() user: AuthUserDto, @Body() dto: ConfirmEmailChangeDto) {
    return this.usersService.confirmEmailChange(user.id, dto.code, dto.newEmail);
  }

  /**
   * تغییر رمز عبور
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر رمز عبور' })
  changePassword(@CurrentUser() user: AuthUserDto, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت کاربر با ID (فقط ادمین)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'آپدیت کاربر (فقط ادمین)' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف کاربر (فقط ادمین)' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.remove(id);
  }
}