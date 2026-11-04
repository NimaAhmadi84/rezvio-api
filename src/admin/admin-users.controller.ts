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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { PermissionGuard } from './guards/permission.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { AdminUsersService } from './admin-users.service';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { BanUserDto } from './dto/ban-user.dto';

@ApiTags('Admin — Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions('user:view')
  @ApiOperation({ summary: 'لیست کاربران (فیلتر + pagination)' })
  @ApiResponse({ status: 200, description: 'لیست کاربران با meta' })
  findAll(@Query() dto: QueryAdminUsersDto) {
    return this.adminUsersService.findAll(dto);
  }

  @Get(':id')
  @RequirePermissions('user:view')
  @ApiOperation({ summary: 'جزئیات یک کاربر' })
  @ApiResponse({ status: 200, description: 'اطلاعات کاربر' })
  @ApiResponse({ status: 404, description: 'کاربر یافت نشد' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminUsersService.findOne(id);
  }

  @Patch(':id/role')
  @RequirePermissions('user:update')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'تغییر نقش کاربر' })
  @ApiResponse({ status: 200, description: 'نقش کاربر تغییر کرد' })
  @ApiResponse({ status: 400, description: 'درخواست نامعتبر' })
  changeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.adminUsersService.changeRole(id, dto, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/ban')
  @RequirePermissions('user:ban')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'مسدود کردن کاربر' })
  @ApiResponse({ status: 200, description: 'کاربر مسدود شد' })
  @ApiResponse({ status: 400, description: 'درخواست نامعتبر' })
  banUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.adminUsersService.banUser(id, dto.reason, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/unban')
  @RequirePermissions('user:ban')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خارج کردن کاربر از مسدودی' })
  @ApiResponse({ status: 200, description: 'کاربر از مسدودی خارج شد' })
  @ApiResponse({ status: 400, description: 'درخواست نامعتبر' })
  unbanUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.adminUsersService.unbanUser(id, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
