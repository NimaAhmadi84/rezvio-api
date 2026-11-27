import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { PermissionGuard } from '../admin/guards/permission.guard';
import { RequirePermissions } from '../admin/decorators/require-permissions.decorator';
import { AdminSiteReviewsService } from './admin-site-reviews.service';
import type { AdminCtx } from './admin-site-reviews.service';
import { QueryAdminSiteReviewsDto } from './dto/query-site-reviews.dto';
import { RejectSiteReviewDto } from './dto/reject-site-review.dto';

/**
 * استخراج context (IP + UserAgent) از Express Request
 * برای audit log
 */
function extractCtx(req: Request): AdminCtx {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
  };
}

/**
 * AdminSiteReviewsController — مدیریت نظرات سایت (admin-facing)
 *
 * @UseGuards(JwtAuthGuard, PermissionGuard) روی class
 * @RequirePermissions('site-review:*') روی هر method
 *
 * ⚠️ ترتیب مسیر: @Get() قبل از @Get(':id') — الزامی (#258)
 */
@ApiTags('Admin — Site Reviews')
@Controller('admin/site-reviews')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AdminSiteReviewsController {
  constructor(private readonly adminSiteReviewsService: AdminSiteReviewsService) {}

  @Get()
  @RequirePermissions('site-review:view')
  @ApiOperation({
    summary: 'لیست همه نظرات (cross-user) با فیلتر پیشرفته + pagination',
  })
  @ApiResponse({ status: 200, description: 'لیست نظرات با meta' })
  findAll(@Query() dto: QueryAdminSiteReviewsDto) {
    return this.adminSiteReviewsService.findAll(dto);
  }

  @Get(':id')
  @RequirePermissions('site-review:view')
  @ApiOperation({ summary: 'جزئیات کامل نظر' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'جزئیات نظر' })
  @ApiResponse({ status: 404, description: 'نظر یافت نشد' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminSiteReviewsService.findOne(id);
  }

  @Patch(':id/approve')
  @RequirePermissions('site-review:moderate')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'تأیید نظر (PENDING → APPROVED) + اعلان به نظردهنده' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'نظر تأیید شد + audit logged' })
  @ApiResponse({ status: 409, description: 'نظر قبلاً بررسی شده است' })
  approve(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.adminSiteReviewsService.approve(user.id, id, extractCtx(req));
  }

  @Patch(':id/reject')
  @RequirePermissions('site-review:moderate')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'رد نظر (PENDING → REJECTED) با دلیل اختیاری + اعلان' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'نظر رد شد + audit logged' })
  @ApiResponse({ status: 409, description: 'نظر قبلاً بررسی شده است' })
  reject(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectSiteReviewDto,
    @Req() req: Request,
  ) {
    return this.adminSiteReviewsService.reject(user.id, id, dto, extractCtx(req));
  }

  @Delete(':id')
  @RequirePermissions('site-review:delete')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'حذف کامل نظر (hard delete) + audit logged' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'نظر حذف شد + audit logged' })
  @ApiResponse({ status: 404, description: 'نظر یافت نشد' })
  remove(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.adminSiteReviewsService.remove(user.id, id, extractCtx(req));
  }
}
