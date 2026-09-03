import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { SearchBusinessesDto } from './dto/search-businesses.dto';

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * تبدیل نام به slug (URL-friendly)
   *
   * منطق: اگه نام فقط شامل حروف انگلیسی، اعداد، فاصله و - بود → slug بساز
   * وگرنه (فارسی/عربی/چینی/یا هر کاراکتر غیرمجاز) → nanoid
   */
  private generateSlugFromName(name: string): string {
    const isOnlyLatin = /^[a-zA-Z0-9\s\-_]+$/.test(name);

    if (!isOnlyLatin) {
      this.logger.debug('📝 نام شامل کاراکترهای غیرلاتین - استفاده از nanoid');
      return nanoid(10);
    }

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

  /**
   * ایجاد کسب‌وکار + ارتقا نقش کاربر (CUSTOMER → OWNER)
   *
   * اگه کاربر از قبل OWNER/ADMIN بود → از متد create استفاده کن
   * اگه CUSTOMER بود → در transaction: ارتقا نقش + ایجاد کسب‌وکار
   */
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

        // ایجاد کسب‌وکار با همه فیلدها
        // NOTE: `let business: any` برای جلوگیری از خطای type reassignment
        let business: any = await tx.business.create({
          data: {
            name: dto.name,
            slug,
            address: dto.address,
            phone: dto.phone,
            description: dto.description,
            logoUrl: dto.logoUrl,
            categoryId: dto.categoryId,
            province: dto.province,
            city: dto.city,
            latitude: dto.latitude,
            longitude: dto.longitude,
            mapLink: dto.mapLink,
            socialMedia: dto.socialMedia
              ? JSON.parse(JSON.stringify(dto.socialMedia))
              : undefined,
            ownerId: userId,
          },
        });

        // ──── 🛡️ WORKAROUND: Prisma 7 + PrismaPg driver adapter (Issue #27359) ────
        // Driver adapter فیلدهای اختیاری رو در create() drop می‌کنه
        // پس فیلدهایی که مقدار دارن رو با update ست می‌کنیم
        const optionalFields: Partial<CreateBusinessDto> = {};
        if (dto.description !== undefined) optionalFields.description = dto.description;
        if (dto.logoUrl !== undefined) optionalFields.logoUrl = dto.logoUrl;
        if (dto.province !== undefined) optionalFields.province = dto.province;
        if (dto.city !== undefined) optionalFields.city = dto.city;
        if (dto.latitude !== undefined) optionalFields.latitude = dto.latitude;
        if (dto.longitude !== undefined) optionalFields.longitude = dto.longitude;
        if (dto.mapLink !== undefined) optionalFields.mapLink = dto.mapLink;

        if (Object.keys(optionalFields).length > 0) {
          business = await tx.business.update({
            where: { id: business.id },
            data: optionalFields as any,
          });
        }

        return business;
      });

      this.logger.log(
        `✅ کسب‌وکار "${dto.name}" با slug "${slug}" ساخته شد + کاربر به OWNER ارتقا یافت`,
      );
      return { ...result, roleUpgraded: true, newRole: UserRole.OWNER };
    }

    // اگه کاربر از قبل OWNER/ADMIN بود، از متد create استفاده کن
    return this.create(dto, userId, currentRole);
  }

  /**
   * ایجاد کسب‌وکار (بدون ارتقا نقش)
   *
   * شامل:
   * - بررسی و ذخیره nationalId در User
   * - تولید/اعتبارسنجی slug
   * - ارتقا نقش به OWNER (اگه اولین کسب‌وکار باشه)
   * - ایجاد کسب‌وکار با همه فیلدها
   * - 🛡️ Workaround برای Prisma 7 driver adapter bug
   */
  async create(dto: CreateBusinessDto, ownerId: string, userRole: UserRole) {
    // ──── بررسی nationalId و ذخیره در User در صورت نیاز ────
    if (dto.nationalId) {
      const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
      if (!user) {
        throw new NotFoundException('کاربر یافت نشد');
      }

      if (user.nationalId && user.nationalId !== dto.nationalId) {
        throw new BadRequestException(
          'کد ملی شما قبلاً در پروفایل ثبت شده است. از همان کد ملی استفاده کنید.',
        );
      }

      if (!this.validateIranianNationalId(dto.nationalId)) {
        throw new BadRequestException('کد ملی نامعتبر است');
      }

      if (!user.nationalId) {
        await this.prisma.user.update({
          where: { id: ownerId },
          data: { nationalId: dto.nationalId },
        });
        this.logger.log(`🆔 nationalId set for user ${ownerId} on business creation`);
      }
    }

    // ──── تولید slug ────
    let slug: string;
    if (dto.customSlug) {
      const existing = await this.prisma.business.findUnique({
        where: { slug: dto.customSlug },
      });
      if (existing) {
        throw new ConflictException('این آدرس اختصاصی قبلاً استفاده شده است');
      }
      slug = dto.customSlug;
    } else {
      slug = await this.ensureUniqueSlug(dto.name);
    }

    // ──── ارتقا نقش به OWNER (فقط در اولین کسب‌وکار) ────
    let roleUpgraded = false;
    let newRole = userRole;
    if (userRole === 'CUSTOMER') {
      const existingBusinesses = await this.prisma.business.count({
        where: { ownerId },
      });
      if (existingBusinesses === 0) {
        await this.prisma.user.update({
          where: { id: ownerId },
          data: { role: 'OWNER' },
        });
        roleUpgraded = true;
        newRole = 'OWNER';
      }
    }

    // ──── ایجاد کسب‌وکار با همه فیلدها ────
    // NOTE: `let business: any` برای جلوگیری از خطای type reassignment
    let business: any = await this.prisma.business.create({
      data: {
        name: dto.name,
        slug,
        address: dto.address,
        phone: dto.phone,
        description: dto.description,
        logoUrl: dto.logoUrl,
        categoryId: dto.categoryId,
        province: dto.province,
        city: dto.city,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mapLink: dto.mapLink,
        socialMedia: dto.socialMedia
          ? JSON.parse(JSON.stringify(dto.socialMedia))
          : undefined,
        ownerId,
      },
      include: {
        category: true,
      },
    });

    // ──── 🛡️ WORKAROUND: Prisma 7 + PrismaPg driver adapter (Issue #27359) ────
    // Driver adapter فیلدهای اختیاری (optional) رو در create() drop می‌کنه
    // پس فیلدهایی که واقعاً مقدار دارن رو با update ست می‌کنیم
    const optionalFields: Partial<CreateBusinessDto> = {};
    if (dto.description !== undefined) optionalFields.description = dto.description;
    if (dto.logoUrl !== undefined) optionalFields.logoUrl = dto.logoUrl;
    if (dto.province !== undefined) optionalFields.province = dto.province;
    if (dto.city !== undefined) optionalFields.city = dto.city;
    if (dto.latitude !== undefined) optionalFields.latitude = dto.latitude;
    if (dto.longitude !== undefined) optionalFields.longitude = dto.longitude;
    if (dto.mapLink !== undefined) optionalFields.mapLink = dto.mapLink;

    if (Object.keys(optionalFields).length > 0) {
      business = await this.prisma.business.update({
        where: { id: business.id },
        data: optionalFields as any,
        include: { category: true },
      });
    }

    this.logger.log(`✅ Business created: ${business.name} (slug: ${business.slug})`);

    return {
      ...business,
      roleUpgraded,
      newRole,
    };
  }

  /**
   * اعتبارسنجی الگوریتم رسمی کد ملی ایران (۱۰ رقم + checksum)
   */
  private validateIranianNationalId(nationalId: string): boolean {
    if (!/^\d{10}$/.test(nationalId)) return false;

    if (/^(\d)\1{9}$/.test(nationalId)) return false;

    const digits = nationalId.split('').map(Number);
    const check = digits[9];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }

    const remainder = sum % 11;

    if (remainder < 2) {
      return check === remainder;
    } else {
      return check === 11 - remainder;
    }
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
        images: { orderBy: { sortOrder: 'asc' } },
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
        images: { orderBy: { sortOrder: 'asc' } },
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
    const business = await this.prisma.business.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    if (business.ownerId !== userId) {
      throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
    }

    const data: any = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.province !== undefined) data.province = dto.province;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.mapLink !== undefined) data.mapLink = dto.mapLink;
    if (dto.socialMedia !== undefined) {
      data.socialMedia = JSON.parse(JSON.stringify(dto.socialMedia));
    }

    const updated = await this.prisma.business.update({
      where: { id },
      data,
      include: { category: true },
    });

    this.logger.log(`✅ Business updated: ${updated.name} (id: ${id})`);

    return updated;
  }

  async remove(id: string, userId: string) {
    await this.checkOwnership(id, userId);
    await this.prisma.business.delete({ where: { id } });
    return { message: 'کسب‌وکار با موفقیت حذف شد' };
  }

  /**
   * جستجو و فیلتر کسب‌وکارها با pagination
   */
  async search(dto: SearchBusinessesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 12;
    const skip = (page - 1) * limit;

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
        maxWait: 5000,
        timeout: 15000,
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
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        _count: { select: { services: true, staff: true, bookings: true } },
      },
    });
  }
  /**
 * محاسبه درصد تکمیل پروفایل کسب‌وکار
 * 
 * مراحل شمارش‌شده (5 تا):
 * - businessInfo: نام + آدرس (در فرم ساخت اجبارین)
 * - logo: لوگو آپلود شده
 * - services: حداقل 1 خدمت
 * - hours: حداقل 1 روز ساعات کاری
 * - shareLink: slug فعال (لینک رزرو)
 * 
 * مرحله اختیاری (در درصد حساب نمی‌شه):
 * - staff: شاید صاحب کسب‌وکار تنها کار می‌کنه
 * 
 * @param businessId - ID کسب‌وکار
 * @param userId - ID کاربر authenticated (برای ownership check)
 */
  async getCompletion(businessId: string, userId: string) {
    // ──── Ownership check ────
    await this.checkOwnership(businessId, userId);

    // ──── Fetch business with counts ────
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        _count: {
          select: {
            services: true,
            staff: true,
            businessHours: true,
          },
        },
      },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    // ──── محاسبه مراحل ────
    const steps = {
      businessInfo: Boolean(business.name && business.address),
      logo: Boolean(business.logoUrl),
      services: business._count.services > 0,
      hours: business._count.businessHours > 0,
      shareLink: Boolean(business.slug),
      staff: business._count.staff > 0,
    };

    // فقط مراحل غیراختیاری در درصد حساب می‌شن
    const counted = [
      steps.businessInfo,
      steps.logo,
      steps.services,
      steps.hours,
      steps.shareLink,
    ];

    const completionPercentage = Math.round(
      (counted.filter(Boolean).length / counted.length) * 100,
    );

    this.logger.debug(
      `✅ Business ${businessId} completion: ${completionPercentage}%`,
    );

    return {
      businessId,
      completionPercentage,
      completionSteps: steps,
    };
  }
}
