import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * تبدیل نام به slug (URL-friendly)
   */
  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // حذف کاراکترهای خاص
      .replace(/\s+/g, '-') // تبدیل فاصله به -
      .replace(/-+/g, '-') // حذف - های تکراری
      .trim();

    // اگه slug خالی بود (مثل نام فارسی)، از nanoid استفاده کن
    if (!baseSlug || baseSlug === '-') {
      return nanoid(10); // slug کوتاه 10 کاراکتری
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
        services: {
          where: {
            // فقط service های فعال (بعداً فیلد active اضافه می‌کنیم)
          },
        },
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

  /**
   * بررسی مالکیت (فقط OWNER می‌تونه business خودش رو ویرایش کنه)
   */
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
    // بررسی مالکیت
    await this.checkOwnership(id, userId);

    const business = await this.prisma.business.update({
      where: { id },
      data: dto,
    });

    return business;
  }

  async remove(id: string, userId: string) {
    // بررسی مالکیت
    await this.checkOwnership(id, userId);

    await this.prisma.business.delete({
      where: { id },
    });

    return { message: 'کسب‌وکار با موفقیت حذف شد' };
  }

  /**
   * دریافت لیست کسب‌وکارهای یک کاربر (Owner)
   */
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
