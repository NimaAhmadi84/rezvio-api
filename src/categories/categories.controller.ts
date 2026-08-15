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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * ساخت دسته‌بندی جدید (فقط ADMIN)
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'ساخت دسته‌بندی جدید',
    description: 'فقط ادمین کل می‌تواند دسته‌بندی جدید بسازد',
  })
  @ApiResponse({ status: 201, description: 'دسته‌بندی با موفقیت ساخته شد' })
  @ApiResponse({ status: 409, description: 'اسلاگ یا نام تکراری است' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  /**
   * دریافت همه دسته‌بندی‌ها (عمومی)
   * مرتب‌سازی بر اساس sortOrder
   */
  @Get()
  @ApiOperation({
    summary: 'دریافت همه دسته‌بندی‌ها',
    description: 'لیست همه دسته‌بندی‌ها به ترتیب sortOrder (عمومی)',
  })
  @ApiResponse({ status: 200, description: 'لیست دسته‌بندی‌ها' })
  findAll() {
    return this.categoriesService.findAll();
  }

  /**
   * دریافت یک دسته‌بندی با slug (عمومی)
   */
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'دریافت دسته‌بندی با slug',
    description: 'دریافت جزئیات یک دسته‌بندی با اسلاگ (عمومی)',
  })
  @ApiResponse({ status: 200, description: 'جزئیات دسته‌بندی' })
  @ApiResponse({ status: 404, description: 'دسته‌بندی یافت نشد' })
  findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  /**
   * دریافت یک دسته‌بندی با ID (عمومی)
   */
  @Get(':id')
  @ApiOperation({
    summary: 'دریافت دسته‌بندی با ID',
    description: 'دریافت جزئیات یک دسته‌بندی با ID (عمومی)',
  })
  @ApiResponse({ status: 200, description: 'جزئیات دسته‌بندی' })
  @ApiResponse({ status: 404, description: 'دسته‌بندی یافت نشد' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.categoriesService.findOne(id);
  }

  /**
   * آپدیت دسته‌بندی (فقط ADMIN)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'آپدیت دسته‌بندی',
    description: 'فقط ادمین کل می‌تواند دسته‌بندی را آپدیت کند',
  })
  @ApiResponse({ status: 200, description: 'دسته‌بندی آپدیت شد' })
  @ApiResponse({ status: 404, description: 'دسته‌بندی یافت نشد' })
  @ApiResponse({ status: 409, description: 'اسلاگ یا نام تکراری است' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  /**
   * حذف دسته‌بندی (فقط ADMIN)
   * کسب‌وکارهای متصل به این دسته، categoryId شون null می‌شه
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'حذف دسته‌بندی',
    description:
      'فقط ادمین کل می‌تواند دسته‌بندی را حذف کند. کسب‌وکارهای متصل به این دسته، categoryId شون null می‌شه.',
  })
  @ApiResponse({ status: 200, description: 'دسته‌بندی حذف شد' })
  @ApiResponse({ status: 404, description: 'دسته‌بندی یافت نشد' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.categoriesService.remove(id);
  }
}
