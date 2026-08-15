import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ساخت دسته‌بندی جدید (فقط ADMIN)
   * بررسی یکتا بودن slug قبل از ساخت
   */
  async create(dto: CreateCategoryDto) {
    // بررسی یکتا بودن slug
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(
        `دسته‌بندی با اسلاگ "${dto.slug}" قبلاً وجود دارد`,
      );
    }

    // بررسی یکتا بودن name
    const existingName = await this.prisma.category.findUnique({
      where: { name: dto.name },
    });

    if (existingName) {
      throw new ConflictException(
        `دسته‌بندی با نام "${dto.name}" قبلاً وجود دارد`,
      );
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    this.logger.log(`✅ دسته‌بندی "${dto.name}" (${dto.slug}) ساخته شد`);
    return category;
  }

  /**
   * دریافت همه دسته‌بندی‌ها (عمومی)
   * مرتب‌سازی بر اساس sortOrder (صعودی)
   */
  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { businesses: true },
        },
      },
    });
  }

  /**
   * دریافت یک دسته‌بندی با slug (عمومی)
   */
  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { businesses: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(
        `دسته‌بندی با اسلاگ "${slug}" یافت نشد`,
      );
    }

    return category;
  }

  /**
   * دریافت یک دسته‌بندی با ID (عمومی)
   */
  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { businesses: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`دسته‌بندی با ID "${id}" یافت نشد`);
    }

    return category;
  }

  /**
   * آپدیت دسته‌بندی (فقط ADMIN)
   */
  async update(id: string, dto: UpdateCategoryDto) {
    // بررسی وجود دسته
    await this.findOne(id);

    // اگه slug تغییر کرده، بررسی یکتا بودن
    if (dto.slug) {
      const existing = await this.prisma.category.findUnique({
        where: { slug: dto.slug },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `اسلاگ "${dto.slug}" قبلاً استفاده شده است`,
        );
      }
    }

    // اگه name تغییر کرده، بررسی یکتا بودن
    if (dto.name) {
      const existingName = await this.prisma.category.findUnique({
        where: { name: dto.name },
      });

      if (existingName && existingName.id !== id) {
        throw new ConflictException(
          `نام "${dto.name}" قبلاً استفاده شده است`,
        );
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: dto,
    });

    this.logger.log(`✅ دسته‌بندی ${id} آپدیت شد`);
    return updated;
  }

  /**
   * حذف دسته‌بندی (فقط ADMIN)
   * اگه کسب‌وکاری به این دسته متصل باشه، categoryId اونا null می‌شه (onDelete: SetNull)
   */
  async remove(id: string) {
    // بررسی وجود دسته
    const category = await this.findOne(id);

    // بررسی کسب‌وکارهای متصل
    const businessCount = await this.prisma.business.count({
      where: { categoryId: id },
    });

    if (businessCount > 0) {
      this.logger.warn(
        `⚠️ حذف دسته "${category.name}" با ${businessCount} کسب‌وکار متصل`,
      );
    }

    await this.prisma.category.delete({ where: { id } });

    this.logger.log(
      `✅ دسته‌بندی "${category.name}" حذف شد (${businessCount} کسب‌وکار به دسته‌بندی "سایر" منتقل شدند)`,
    );

    return {
      message: 'دسته‌بندی با موفقیت حذف شد',
      affectedBusinesses: businessCount,
    };
  }
}
