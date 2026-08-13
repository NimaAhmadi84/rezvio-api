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

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * تبدیل نام به slug (URL-friendly)
   */
  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    if (!baseSlug || baseSlug === '-') {
      return nanoid(10);
    }

    return baseSlug;
  }

  /**
   * بررسی اینکه slug منحصر به فرد باشد
   */
  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.business.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * ساخت کسب‌وکار با ارتقا خودکار نقش (Phase 10)
   *
   * منطق:
   * - اگه کاربر CUSTOMER باشه → در یک transaction:
   *     1. ارتقا role به OWNER
   *     2. ساخت business
   * - اگه کاربر OWNER یا ADMIN باشه → فقط business ساخته می‌شه
   *
   * استفاده از $transaction برای جلوگیری از race condition:
   * اگه یه لحظه بین ارتقا و ساخت business خطا بیفته،
   * کاربر بدون business به OWNER ارتقا پیدا نمی‌کنه.
   */
  async createWithRoleUpgrade(
    userId: string,
    currentRole: UserRole,
    dto: CreateBusinessDto,
  ) {
    const baseSlug = this.generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);

    // اگه کاربر CUSTOMER هست، باید به OWNER ارتقا پیدا کنه
    const shouldUpgrade = currentRole === UserRole.CUSTOMER;

    if (shouldUpgrade) {
      this.logger.log(`🚀 ارتقا کاربر ${userId} از CUSTOMER به OWNER`);

      // همه چیز در یک transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. ارتقا نقش
        await tx.user.update({
          where: { id: userId },
          data: { role: UserRole.OWNER },
        });

        // 2. ساخت business
        const business = await tx.business.create({
          data: {
            name: dto.name,
            slug,
            address: dto.address,
            phone: dto.phone,
            ownerId: userId,
          },
        });

        return business;
      });

      this.logger.log(`✅ کسب‌وکار "${dto.name}" ساخته شد + کاربر به OWNER ارتقا یافت`);

      return {
        ...result,
        roleUpgraded: true,
        newRole: UserRole.OWNER,
      };
    }

    // اگه کاربر قبلاً OWNER یا ADMIN هست، فقط business می‌سازیم
    const business = await this.prisma.business.create({
      data: {
        name: dto.name,
        slug,
        address: dto.address,
        phone: dto.phone,
        ownerId: userId,
      },
    });

    this.logger.log(`✅ کسب‌وکار "${dto.name}" ساخته شد (کاربر از قبل ${currentRole} بود)`);

    return {
      ...business,
      roleUpgraded: false,
      newRole: currentRole,
    };
  }

  async create(userId: string, dto: CreateBusinessDto) {
    const baseSlug = this.generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);

    const business = await this.prisma.business.create({
      data: {
        name: dto.name,
        slug,
        address: dto.address,
        phone: dto.phone,
        ownerId: userId,
      },
    });

    return business;
  }

  async findAll() {
    return this.prisma.business.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            services: true,
            staff: true,
            bookings: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        services: true,
        staff: true,
        businessHours: true,
        holidays: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    return business;
  }

  async findBySlug(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      include: {
        services: {},
        staff: true,
        businessHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    return business;
  }

  async checkOwnership(businessId: string, userId: string): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    if (business.ownerId !== userId) {
      throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
    }
  }

  async update(id: string, userId: string, dto: UpdateBusinessDto) {
    await this.checkOwnership(id, userId);

    const business = await this.prisma.business.update({
      where: { id },
      data: dto,
    });

    return business;
  }

  async remove(id: string, userId: string) {
    await this.checkOwnership(id, userId);

    await this.prisma.business.delete({
      where: { id },
    });

    return { message: 'کسب‌وکار با موفقیت حذف شد' };
  }

  async findByOwner(ownerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId },
      include: {
        _count: {
          select: {
            services: true,
            staff: true,
            bookings: true,
          },
        },
      },
    });
  }
}
