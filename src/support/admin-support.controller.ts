import {
  Controller,
  Get,
  Post,
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
import type { Request } from 'express';
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
import { PermissionGuard } from '../admin/guards/permission.guard';
import { RequirePermissions } from '../admin/decorators/require-permissions.decorator';
import { AdminSupportService } from './admin-support.service';
import type { AdminCtx } from './admin-support.service';
import { QueryAdminTicketsDto } from './dto/query-admin-tickets.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';

/**
 * استخراج context (IP + UserAgent) از Express Request
 * برای audit log — در AdminActivityLogger.log() استفاده می‌شود
 */
function extractCtx(req: Request): AdminCtx {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
  };
}

/**
 * AdminSupportController — endpoints ادمین (admin-facing)
 *
 * @UseGuards(JwtAuthGuard, PermissionGuard) روی class
 * @RequirePermissions('ticket:*') روی هر method
 *
 * Route ordering: @Get() قبل از @Get(':id') — الزامی (#258)
 */
@ApiTags('Admin — Support Tickets')
@Controller('admin/support/tickets')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AdminSupportController {
  constructor(private readonly adminSupportService: AdminSupportService) {}

  @Get()
  @RequirePermissions('ticket:view')
  @ApiOperation({
    summary: 'لیست همه تیکت‌ها (cross-user) با فیلتر پیشرفته + pagination',
  })
  @ApiResponse({ status: 200, description: 'لیست تیکت‌ها با meta' })
  findAll(@Query() dto: QueryAdminTicketsDto) {
    return this.adminSupportService.findAll(dto);
  }

  @Get(':id')
  @RequirePermissions('ticket:view')
  @ApiOperation({
    summary: 'جزئیات کامل تیکت (همه پیام‌ها — شامل internal notes)',
  })
  @ApiResponse({ status: 200, description: 'تیکت با همه پیام‌ها' })
  @ApiResponse({ status: 404, description: 'تیکت یافت نشد' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminSupportService.findOne(id);
  }

  @Post(':id/reply')
  @RequirePermissions('ticket:reply')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'پاسخ ادمین (auto IN_PROGRESS اگر OPEN بود)',
  })
  @ApiResponse({ status: 201, description: 'پاسخ ثبت شد + audit logged' })
  @ApiResponse({
    status: 400,
    description: 'تیکت RESOLVED/CLOSED است یا داده نامعتبر',
  })
  reply(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplyTicketDto,
    @Req() req: Request,
  ) {
    return this.adminSupportService.reply(
      user.id,
      id,
      dto,
      extractCtx(req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('ticket:change-status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'تغییر وضعیت تیکت (با validation transition)',
  })
  @ApiResponse({ status: 200, description: 'وضعیت تغییر کرد + audit logged' })
  @ApiResponse({ status: 400, description: 'transition مجاز نیست' })
  @ApiResponse({ status: 404, description: 'تیکت یافت نشد' })
  changeStatus(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @Req() req: Request,
  ) {
    return this.adminSupportService.changeStatus(
      user.id,
      id,
      dto,
      extractCtx(req),
    );
  }

  @Patch(':id/assign')
  @RequirePermissions('ticket:assign')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'تخصیص تیکت به ادمین (فقط Super Admin) یا unassign',
  })
  @ApiResponse({ status: 200, description: 'تخصیص انجام شد + audit logged' })
  @ApiResponse({ status: 400, description: 'ادمین هدف غیرفعال است' })
  @ApiResponse({ status: 404, description: 'تیکت یا ادمین هدف یافت نشد' })
  assign(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignTicketDto,
    @Req() req: Request,
  ) {
    return this.adminSupportService.assign(
      user.id,
      id,
      dto.adminId ?? null,
      extractCtx(req),
    );
  }
}