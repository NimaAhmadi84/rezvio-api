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
import { AdminManagementService } from './admin-management.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryAdminsDto } from './dto/query-admins.dto';

@ApiTags('Admin — Admins & Roles')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AdminManagementController {
  constructor(private readonly service: AdminManagementService) {}

  // ──── Admins ────

  @Get('admins')
  @RequirePermissions('admin:view')
  @ApiOperation({ summary: 'لیست ادمین‌ها' })
  listAdmins(@Query() dto: QueryAdminsDto) {
    return this.service.listAdmins(dto);
  }

  @Get('admins/:id')
  @RequirePermissions('admin:view')
  @ApiOperation({ summary: 'جزئیات ادمین' })
  getAdmin(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getAdmin(id);
  }

  @Post('admins')
  @RequirePermissions('admin:create')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'ایجاد ادمین جدید (کاربر را به ADMIN ارتقا می‌دهد)' })
  @ApiResponse({ status: 201, description: 'ادمین ایجاد شد' })
  createAdmin(
    @Body() dto: CreateAdminDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.service.createAdmin(dto, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch('admins/:id')
  @RequirePermissions('admin:update')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ویرایش نقش یا وضعیت فعال ادمین' })
  updateAdmin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.service.updateAdmin(id, dto, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete('admins/:id')
  @RequirePermissions('admin:delete')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'غیرفعال‌سازی ادمین (soft delete — Audit Log حفظ می‌شود)',
  })
  deactivateAdmin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.service.deactivateAdmin(id, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ──── Roles ────

  @Get('roles')
  @RequirePermissions('admin:view')
  @ApiOperation({ summary: 'لیست نقش‌ها با تعداد ادمین و مجوز' })
  listRoles() {
    return this.service.listRoles();
  }

  @Get('roles/:id')
  @RequirePermissions('admin:view')
  @ApiOperation({ summary: 'جزئیات نقش + ادمین‌های متصل' })
  getRole(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getRole(id);
  }

  @Post('roles')
  @RequirePermissions('admin:create')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'ایجاد نقش سفارشی جدید' })
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.service.createRole(dto, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch('roles/:id')
  @RequirePermissions('admin:update')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ویرایش نقش (تغییر نام/توضیح/مجوزها)' })
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.service.updateRole(id, dto, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete('roles/:id')
  @RequirePermissions('admin:delete')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'حذف نقش سفارشی (فقط بدون ادمین متصل)' })
  deleteRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUserDto,
    @Req() req: any,
  ) {
    return this.service.deleteRole(id, admin.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ──── Permissions (list only) ────

  @Get('permissions')
  @RequirePermissions('admin:view')
  @ApiOperation({ summary: 'لیست همه مجوزها (گروه‌بندی بر اساس ماژول)' })
  listPermissions() {
    return this.service.listPermissions();
  }
}
