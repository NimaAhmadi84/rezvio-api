import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  /**
   * ساخت کسب‌وکار جدید
   *
   * منطق ارتقا خودکار:
   * - اگه کاربر CUSTOMER باشه → به OWNER ارتقا می‌یابه
   * - اگه کاربر OWNER باشه → همون OWNER می‌مونه
   * - اگه کاربر ADMIN باشه → همون ADMIN می‌مونه
   *
   * همه این ارتقاها + ساخت business در یک transaction انجام می‌شه
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'ساخت کسب‌وکار جدید + ارتقا خودکار CUSTOMER به OWNER',
    description: 'هر کاربر authenticated می‌تونه کسب‌وکار بسازه. اگه CUSTOMER باشه، به OWNER ارتقا می‌یابه.',
  })
  @ApiResponse({ status: 201, description: 'کسب‌وکار با موفقیت ساخته شد' })
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateBusinessDto) {
    return this.businessesService.createWithRoleUpgrade(user.id, user.role, dto);
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
}
