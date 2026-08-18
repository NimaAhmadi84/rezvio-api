import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { SearchBusinessesDto } from './dto/search-businesses.dto';

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * تبدیل نام به slug (URL-friendly)
   *
   * منطق ساده و قابل اعتماد:
   * 1. اگه نام شامل حروف فارسی/عربی باشه و لاتین کمتر از ۱۰ کاراکتر باشه → nanoid
   * 2. اگه هیچ لاتین نباشه → nanoid
   * 3. وگرنه slug بساز از لاتین‌ها
   *
   * مثال:
   * - "Ali Barber" → no Persian, 10 latin → "ali-barber" ✅
   * - "آرایشگاه علی" → Persian, 0 latin < 10 → nanoid ✅
   * - "آرایشگاه بدون slug" → Persian, 4 latin < 10 → nanoid ✅
   * - "Nima-Barber-2026" → no Persian, 14 latin → "nima-barber-2026" ✅
   * - "My Barber آرایشگاه" → Persian, 8 latin < 10 → nanoid ✅
   * - "Tehran Beauty Salon" → no Persian, 19 latin → "tehran-beauty-salon" ✅
   * - "Best Barber آرایشگاه مدرن" → Persian, 10 latin >= 10 → "best-barber" ✅ (edge case)
   */
  /**
   * تبدیل نام به slug (URL-friendly)
   *
   * منطق: اگه نام شامل حروف غیرلاتین (فارسی/عربی/چینی/هندی) باشه → nanoid
   * وگرنه slug از حروف لاتین ساخته می‌شه
   */
  /**
   * تبدیل نام به slug (URL-friendly)
   * 
   * منطق: اگه نام شامل هر کاراکتر غیر-ASCII باشه (فارسی/عربی/چینی/...) → nanoid
   * وگرنه slug از حروف لاتین
   * 
   * چرا این روش:
   * - regex [^\x00-\x7F] هر کاراکتر غیر-ASCII را match می‌کنه
   * - نیازی به \u escape نداره و در همه محیط‌ها کار می‌کنه
   * - شامل فارسی، عربی، چینی، هندی، روسی و همه زبان‌های غیرلاتین
   */
  /**
   * تبدیل نام به slug (URL-friendly)
   * 
   * منطق: اگه نام فقط شامل حروف انگلیسی، اعداد، فاصله و - بود → slug بساز
   * وگرنه (فارسی/عربی/چینی/یا هر کاراکتر غیرمجاز) → nanoid
   * 
   * چرا این روش:
   * - چک مثبت (فقط کاراکترهای مجاز) به جای چک منفی (کاراکترهای غیرمجاز)
   * - robust در برابر encoding problems
   * - حتی اگر حروف فارسی به ? تبدیل شوند، باز هم nanoid می‌سازد
   */
  private generateSlugFromName(name: string): string {
    // چک کن آیا نام فقط شامل کاراکترهای مجاز است؟
    // مجاز: a-z, A-Z, 0-9, فاصله, -, _
    const isOnlyLatin = /^[a-zA-Z0-9\s\-_]+$/.test(name);
    
    if (!isOnlyLatin) {
      this.logger.debug('📝 نام شامل کاراکترهای غیرلاتین - استفاده از nanoid');
      return nanoid(10);
    }

    // ساخت slug از حروف لاتین
    const baseSlug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim();

    if (!baseSlug || baseSlug.length < 3 || !/[a-z]/.test(baseSlug)) {
      this.logger.debug('📝 slug معتبر نیست - استفاده از nanoid');
      return nanoid(10);
    }

    this.logger.debug(`📝 slug ساخته شد: ${baseSlug}`);
    return baseSlug;
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    while (await this.prisma.business.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    return slug;
  }

  async checkSlugAvailability(requestedSlug: string): Promise<{
    available: boolean;
    finalSlug: string;
    reason?: string;
  }> {
    const trimmed = requestedSlug.trim();

    if (/[A-Z]/.test(trimmed)) {
      return {
        available: false,
        finalSlug: trimmed.toLowerCase(),
        reason: 'فقط حروف کوچک انگلیسی مجاز است',
      };
    }

    const normalized = trimmed.toLowerCase();

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized)) {
      return {
        available: false,
        finalSlug: normalized,
        reason: 'فرمت نامعتبر: فقط حروف کوچک انگلیسی، اعداد و - مجاز است',
      };
    }

    if (normalized.length < 3 || normalized.length > 50) {
      return {
        available: false,
        finalSlug: normalized,
        reason: 'طول نامعتبر: باید بین ۳ تا ۵۰ کاراکتر باشد',
      };
    }

    const existing = await this.prisma.business.findUnique({
      where: { slug: normalized },
    });

    if (!existing) return { available: true, finalSlug: normalized };

    const suggestedSlug = await this.ensureUniqueSlug(normalized);
    return {
      available: false,
      finalSlug: suggestedSlug,
      reason: 'این آدرس قبلاً استفاده شده است',
    };
  }

  private async resolveSlug(dto: CreateBusinessDto): Promise<string> {
    if (dto.customSlug && dto.customSlug.trim()) {
      return this.ensureUniqueSlug(dto.customSlug.trim().toLowerCase());
    }
    return this.ensureUniqueSlug(this.generateSlugFromName(dto.name));
  }

  async createWithRoleUpgrade(
    userId: string,
    currentRole: UserRole,
    dto: CreateBusinessDto,
  ) {
    const slug = await this.resolveSlug(dto);
    const shouldUpgrade = currentRole === UserRole.CUSTOMER;

    if (shouldUpgrade) {
      this.logger.log(`🚀 ارتقا کاربر ${userId} از CUSTOMER به OWNER`);
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { role: UserRole.OWNER },
        });
        return tx.business.create({
          data: {
            name: dto.name,
            slug,
            address: dto.address,
            phone: dto.phone,
            ownerId: userId,
            categoryId: dto.categoryId,
          },
        });
      });
      this.logger.log(`✅ کسب‌وکار "${dto.name}" با slug "${slug}" ساخته شد + کاربر به OWNER ارتقا یافت`);
      return { ...result, roleUpgraded: true, newRole: UserRole.OWNER };
    }

    const business = await this.prisma.business.create({
      data: {
        name: dto.name,
        slug,
        address: dto.address,
        phone: dto.phone,
        ownerId: userId,
        categoryId: dto.categoryId,
      },
    });
    this.logger.log(`✅ کسب‌وکار "${dto.name}" با slug "${slug}" ساخته شد (کاربر از قبل ${currentRole} بود)`);
    return { ...business, roleUpgraded: false, newRole: currentRole };
  }

  async create(userId: string, dto: CreateBusinessDto) {
    const slug = await this.resolveSlug(dto);
    return this.prisma.business.create({
      data: { name: dto.name, slug, address: dto.address, phone: dto.phone, ownerId: userId },
    });
  }

  async findAll() {
    return this.prisma.business.findMany({
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { services: true, staff: true, bookings: true } },
      },
    });
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        services: true,
        staff: true,
        businessHours: true,
        holidays: true,
        _count: { select: { bookings: true } },
      },
    });
    if (!business) throw new NotFoundException('کسب‌وکار یافت نشد');
    return business;
  }

  async findBySlug(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      include: {
        category: true,
        services: true,
        staff: true,
        businessHours: { orderBy: { dayOfWeek: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });
    if (!business) throw new NotFoundException('کسب‌وکار یافت نشد');

    // افزایش viewsCount (آمار بازدید صفحه عمومی)
    await this.prisma.business.update({
      where: { id: business.id },
      data: { viewsCount: { increment: 1 } },
    });

    // مقدار viewsCount را دستی افزایش می‌دهیم تا در response درست باشد
    business.viewsCount = (business.viewsCount ?? 0) + 1;

    return business;
  }

  async checkOwnership(businessId: string, userId: string): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });
    if (!business) throw new NotFoundException('کسب‌وکار یافت نشد');
    if (business.ownerId !== userId)
      throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
  }

  async update(id: string, userId: string, dto: UpdateBusinessDto) {
    await this.checkOwnership(id, userId);
    return this.prisma.business.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.checkOwnership(id, userId);
    await this.prisma.business.delete({ where: { id } });
    return { message: 'کسب‌وکار با موفقیت حذف شد' };
  }


  /**
   * جستجو و فیلتر کسب‌وکارها با pagination
   * - q: جستجو در نام
   * - city: فیلتر بر اساس شهر (بخشی از آدرس)
   * - categoryId: فیلتر بر اساس دسته‌بندی
   * - sort: newest, popular, most-viewed, name-asc, name-desc
   * - page, limit: pagination
   */
  async search(dto: SearchBusinessesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 12;
    const skip = (page - 1) * limit;

    // ساخت where clause
    const where: any = {};

    if (dto.q) {
      where.name = { contains: dto.q, mode: 'insensitive' };
    }

    if (dto.city) {
      where.address = { contains: dto.city, mode: 'insensitive' };
    }

    if (dto.categoryId) {
      where.categoryId = dto.categoryId;
    }

    if (dto.since) {
      where.createdAt = { gte: new Date(dto.since) };
    }

    // مرتب‌سازی
    let orderBy: any = { createdAt: 'desc' };
    switch (dto.sort) {
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'popular':
        orderBy = { bookingsCount: 'desc' };
        break;
      case 'most-viewed':
        orderBy = { viewsCount: 'desc' };
        break;
      case 'name-asc':
        orderBy = { name: 'asc' };
        break;
      case 'name-desc':
        orderBy = { name: 'desc' };
        break;
    }

    // 🎯 Interactive Transaction — پایدارتر از Batch Transaction برای Supabase
    // جلوگیری از خطای P2028 تحت ترافیک بالا با timeoutهای محافظ
    const [items, total] = await this.prisma.$transaction(
      async (tx) => {
        const itemsResult = await tx.business.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            category: true,
            _count: { select: { services: true, staff: true, bookings: true } },
          },
        });
        const totalResult = await tx.business.count({ where });
        return [itemsResult, totalResult];
      },
      {
        maxWait: 5000,   // حداکثر 5 ثانیه صبر برای شروع transaction
        timeout: 15000,  // حداکثر 15 ثانیه برای کل عملیات
      },
    );

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findByOwner(ownerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId },
      include: { _count: { select: { services: true, staff: true, bookings: true } } },
    });
  }
}
