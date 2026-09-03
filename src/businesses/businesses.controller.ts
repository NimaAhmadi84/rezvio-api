import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { SearchBusinessesDto } from './dto/search-businesses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) { }

  /**
   * ساخت کسب‌وکار جدید + ارتقا خودکار CUSTOMER به OWNER
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'ساخت کسب‌وکار جدید + ارتقا خودکار CUSTOMER به OWNER',
    description:
      'هر کاربر authenticated می‌تونه کسب‌وکار بسازه. اگه CUSTOMER باشه، به OWNER ارتقا می‌یابه. اگه customSlug داده بشه، به عنوان slug استفاده می‌شه.',
  })
  @ApiResponse({ status: 201, description: 'کسب‌وکار با موفقیت ساخته شد' })
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateBusinessDto) {
    return this.businessesService.createWithRoleUpgrade(user.id, user.role, dto);
  }

  /**
   * بررسی آزاد بودن slug (Real-time check برای frontend)
   *
   * نکته: slug رو بدون lowercase به service می‌فرستیم
   * چون service خودش lowercase و validation می‌کنه.
   * این باعث می‌شه بتونیم حروف بزرگ رو تشخیص بدیم و رد کنیم.
   */
  @Get('check-slug')
  @ApiOperation({
    summary: 'بررسی آزاد بودن slug (عمومی)',
    description:
      'برای بررسی real-time در فرم ساخت کسب‌وکار. اگه گرفته شده باشه، یه slug جایگزین پیشنهاد می‌ده. اگه حروف بزرگ داشته باشه، رد می‌کنه.',
  })
  @ApiResponse({
    status: 200,
    description: '{ available: boolean, finalSlug: string, reason?: string }',
  })
  checkSlug(@Query('slug') slug: string) {
    if (!slug || typeof slug !== 'string') {
      return { available: false, finalSlug: '', reason: 'slug الزامی است' };
    }
    // slug رو بدون lowercase بفرست - service خودش lowercase و validate می‌کنه
    return this.businessesService.checkSlugAvailability(slug.trim());
  }


  /**
   * جستجو و فیلتر کسب‌وکارها (عمومی)
   * با pagination و sorting
   */
  @Get('search')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30000) // 30 seconds cache for search results
  @ApiOperation({
    summary: 'جستجو و فیلتر کسب‌وکارها',
    description: 'جستجو در کسب‌وکارها با فیلتر (شهر، دسته‌بندی، نام) و pagination و sorting',
  })
  @ApiResponse({ status: 200, description: 'لیست کسب‌وکارها با pagination' })
  search(@Query() dto: SearchBusinessesDto) {
    return this.businessesService.search(dto);
  }

  @Get()
  @ApiOperation({ summary: 'دریافت لیست همه کسب‌وکارها (عمومی)' })
  findAll() {
    return this.businessesService.findAll();
  }

  @Get('my-businesses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت کسب‌وکارهای من (فقط OWNER)' })
  findMyBusinesses(@CurrentUser() user: AuthUserDto) {
    return this.businessesService.findByOwner(user.id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'دریافت کسب‌وکار با slug (عمومی - برای صفحه رزرو)' })
  findBySlug(@Param('slug') slug: string) {
    return this.businessesService.findBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'دریافت کسب‌وکار با ID' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.businessesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'آپدیت کسب‌وکار (فقط مالک یا ADMIN)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف کسب‌وکار (فقط مالک یا ADMIN)' })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.businessesService.remove(id, user.id);
  }
  /**
 * محاسبه درصد تکمیل پروفایل کسب‌وکار
 * 
 * برای نمایش در داشبورد: progress bar + چک‌لیست مراحل
 */
  @Get(':id/completion')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'درصد تکمیل پروفایل کسب‌وکار',
    description:
      'محاسبه درصد تکمیل setup: اطلاعات کسب‌وکار، لوگو، خدمت‌ها، ساعات کاری، لینک رزرو.',
  })
  @ApiResponse({
    status: 200,
    description: 'درصد تکمیل و وضعیت هر مرحله',
    schema: {
      type: 'object',
      properties: {
        businessId: { type: 'string', example: 'uuid' },
        completionPercentage: { type: 'number', example: 60 },
        completionSteps: {
          type: 'object',
          properties: {
            businessInfo: { type: 'boolean' },
            logo: { type: 'boolean' },
            services: { type: 'boolean' },
            hours: { type: 'boolean' },
            shareLink: { type: 'boolean' },
            staff: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'احراز هویت لازم است' })
  @ApiResponse({ status: 403, description: 'شما مالک این کسب‌وکار نیستید' })
  @ApiResponse({ status: 404, description: 'کسب‌وکار یافت نشد' })
  getCompletion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.businessesService.getCompletion(id, user.id);
  }
}
