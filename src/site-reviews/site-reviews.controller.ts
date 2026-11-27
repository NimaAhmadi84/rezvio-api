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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { SiteReviewsService } from './site-reviews.service';
import { CreateSiteReviewDto } from './dto/create-site-review.dto';
import { UpdateSiteReviewDto } from './dto/update-site-review.dto';
import { QuerySiteReviewsDto } from './dto/query-site-reviews.dto';

/**
 * SiteReviewsController — نظرات کاربران درباره خود سایت رزویو
 *
 * - POST /site-reviews         ثبت نظر (احراز هویت، ۵/دقیقه)
 * - GET  /site-reviews         لیست نظرات تأییدشده (عمومی + optional auth)
 * - GET  /site-reviews/summary جمع‌بندی (عمومی)
 * - GET  /site-reviews/mine    نظرات من (احراز هویت)
 * - GET  /site-reviews/:id     جزئیات (عمومی برای تأییدشده، فقط صاحب برای غیره)
 * - PATCH /site-reviews/:id    ویرایش (فقط صاحب)
 * - DELETE /site-reviews/:id   حذف (فقط صاحب)
 *
 * ⚠️ ترتیب مسیر (route order): summary و mine يجبر قبل از :id声明 شوند (#258)
 */
@ApiTags('Site Reviews')
@Controller('site-reviews')
export class SiteReviewsController {
  constructor(private readonly siteReviewsService: SiteReviewsService) {}

  /**
   * ثبت نظر جدید (نیاز به احراز هویت)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ثبت نظر جدید درباره سایت' })
  @ApiResponse({ status: 201, description: 'نظر با وضعیت PENDING ثبت شد' })
  @ApiResponse({
    status: 409,
    description: 'قبلاً نظر ثبت کرده‌اید یا داده نامعتبر است',
  })
  async create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateSiteReviewDto) {
    return this.siteReviewsService.create(user.id, dto);
  }

  /**
   * لیست نظرات تأییدشده (عمومی با optional auth)
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'لیست نظرات تأییدشده با فیلتر و مرتب‌سازی' })
  @ApiResponse({ status: 200, description: 'لیست نظرات + meta + summary' })
  async list(
    @Query() query: QuerySiteReviewsDto,
    @CurrentUser() user?: AuthUserDto,
  ) {
    return this.siteReviewsService.list(query, user?.id);
  }

  /**
   * جمع‌بندی نظرات تأییدشده (میانگین + تعداد + توزیع)
   */
  @Get('summary')
  @ApiOperation({ summary: 'جمع‌بندی نظرات تأییدشده (میانگین امتیاز و تعداد)' })
  @ApiResponse({ status: 200, description: 'جمع‌بندی نظرات' })
  async summary() {
    return this.siteReviewsService.summary();
  }

  /**
   * لیست نظرات من (همه وضعیت‌ها)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: 'لیست نظرات خود (PENDING/APPROVED/REJECTED)' })
  @ApiResponse({ status: 200, description: 'لیست نظرات من' })
  async mine(@CurrentUser() user: AuthUserDto) {
    return this.siteReviewsService.mine(user.id);
  }

  /**
   * جزئیات یک نظر
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'جزئیات نظر (فقط نظرات تأییدشده عمومی است)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'جزئیات نظر' })
  @ApiResponse({ status: 404, description: 'نظر یافت نشد' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user?: AuthUserDto,
  ) {
    return this.siteReviewsService.findOne(id, user?.id);
  }

  /**
   * ویرایش نظر (فقط صاحب نظر)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'ویرایش نظر (وضعیت دوباره PENDING می‌شود)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'نظر به‌روزرسانی شد' })
  @ApiResponse({ status: 403, description: 'فقط صاحب نظر می‌تواند ویرایش کند' })
  async update(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSiteReviewDto,
  ) {
    return this.siteReviewsService.update(user.id, id, dto);
  }

  /**
   * حذف نظر (فقط صاحب نظر)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'حذف نظر (فقط صاحب نظر)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'نظر حذف شد' })
  @ApiResponse({ status: 403, description: 'فقط صاحب نظر می‌تواند حذف کند' })
  async remove(@CurrentUser() user: AuthUserDto, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.siteReviewsService.remove(user.id, id);
  }
}
