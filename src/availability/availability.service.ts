import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessHourDto } from './dto/create-business-hour.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { CreateBatchHolidayDto } from './dto/create-batch-holiday.dto';
import { BusinessesService } from '../businesses/businesses.service';

// ──── UTC Date Helpers (جلوگیری از timezone drift ایران) ────
// چرا؟ new Date('2026-09-15') در ایران می‌شود 2026-09-14T20:30:00Z (یک روز قبل)
const parseISOtoUTC = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

const toUTCISO = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  // ============================================
  // Business Hours Methods
  // ============================================

  async setBusinessHours(userId: string, dto: CreateBusinessHourDto) {
    // بررسی مالکیت business
    await this.businessesService.checkOwnership(dto.businessId, userId);

    // اعتبارسنجی: ساعت پایان باید بعد از ساعت شروع باشد
    for (const hour of dto.hours) {
      if (hour.closeTime <= hour.openTime) {
        throw new BadRequestException(
          `ساعت پایان (${hour.closeTime}) باید بعد از ساعت شروع (${hour.openTime}) باشد`,
        );
      }
    }

    // حذف ساعات کاری قبلی و جایگزینی با ساعات جدید (در یک transaction)
    await this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({
        where: { businessId: dto.businessId },
      });

      await tx.businessHour.createMany({
        data: dto.hours.map((hour) => ({
          businessId: dto.businessId,
          dayOfWeek: hour.dayOfWeek,
          openTime: hour.openTime,
          closeTime: hour.closeTime,
        })),
      });
    });

    return this.getBusinessHours(dto.businessId);
  }

  async getBusinessHours(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    return this.prisma.businessHour.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeBusinessHour(businessId: string, dayOfWeek: number, userId: string) {
    // بررسی مالکیت business
    await this.businessesService.checkOwnership(businessId, userId);

    const existing = await this.prisma.businessHour.findFirst({
      where: { businessId, dayOfWeek },
    });

    if (!existing) {
      throw new NotFoundException('ساعت کاری برای این روز یافت نشد');
    }

    await this.prisma.businessHour.deleteMany({
      where: { businessId, dayOfWeek },
    });

    return { message: 'ساعت کاری با موفقیت حذف شد' };
  }

  // ============================================
  // Holidays Methods
  // ============================================

  async addHoliday(userId: string, dto: CreateHolidayDto) {
    // بررسی مالکیت business
    await this.businessesService.checkOwnership(dto.businessId, userId);

    // ⚠️ CRITICAL: استفاده از parseISOtoUTC برای جلوگیری از timezone drift
    // بدون این، '2026-09-15' در ایران به '2026-09-14' drift می‌کند
    const holiday = await this.prisma.holiday.create({
      data: {
        businessId: dto.businessId,
        date: parseISOtoUTC(dto.date),
        reason: dto.reason,
      },
    });

    return holiday;
  }

  /**
   * افزودن تعطیلات بازه‌ای (Phase 23)
   *
   * کاربرد: نوروز (۱۳ روز)، مسافرت (یک هفته)، مریضی طولانی
   *
   * منطق:
   * 1. اعتبارسنجی مالکیت business
   * 2. اعتبارسنجی بازه (startDate <= endDate, max 90 روز)
   * 3. تولید آرایه تاریخ‌ها (inclusive) با UTC برای جلوگیری از drift
   * 4. بررسی تکراری نبودن با holidays موجود
   * 5. ایجاد در transaction (atomicity)
   *
   * خروجی: { created, skipped, total, reason, startDate, endDate }
   */
  async addBatchHolidays(userId: string, dto: CreateBatchHolidayDto) {
    // ──── Step 1: اعتبارسنجی مالکیت ────
    await this.businessesService.checkOwnership(dto.businessId, userId);

    // ──── Step 2: اعتبارسنجی بازه (با UTC helper) ────
    const startDate = parseISOtoUTC(dto.startDate);
    const endDate = parseISOtoUTC(dto.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('تاریخ‌های نامعتبر');
    }

    if (startDate > endDate) {
      throw new BadRequestException(
        'تاریخ شروع باید قبل یا مساوی تاریخ پایان باشد',
      );
    }

    // محاسبه تعداد روزها (inclusive)
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysDiff =
      Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

    const MAX_DAYS = 90;
    if (daysDiff > MAX_DAYS) {
      throw new BadRequestException(
        `بازه نمی‌تواند بیش از ${MAX_DAYS} روز باشد (درخواست شما: ${daysDiff} روز)`,
      );
    }

    // ──── Step 3: تولید آرایه تاریخ‌ها (UTC برای جلوگیری از timezone drift) ────
    const dates: Date[] = [];
    const cursor = new Date(startDate);
    const endUtc = new Date(endDate);

    while (cursor.getTime() <= endUtc.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // ──── Step 4: بررسی تکراری نبودن با holidays موجود ────
    const existingHolidays = await this.prisma.holiday.findMany({
      where: {
        businessId: dto.businessId,
        date: { in: dates },
      },
      select: { date: true },
    });

    // ساخت Set از تاریخ‌های موجود
    const existingSet = new Set(existingHolidays.map((h) => toUTCISO(h.date)));

    // فیلتر تاریخ‌های جدید
    const newDates = dates.filter((d) => !existingSet.has(toUTCISO(d)));

    if (newDates.length === 0) {
      throw new BadRequestException(
        'تمام تاریخ‌های انتخابی قبلاً به عنوان تعطیلی ثبت شده‌اند',
      );
    }

    // ──── Step 5: ایجاد در transaction (atomicity) ────
    const result = await this.prisma.$transaction(async (tx) => {
      return tx.holiday.createMany({
        data: newDates.map((date) => ({
          businessId: dto.businessId,
          date,
          reason: dto.reason,
        })),
        skipDuplicates: true,
      });
    });

    const skipped = dates.length - newDates.length;

    this.logger.log(
      `📅 Batch holiday created: ${result.count} new, ${skipped} skipped for business ${dto.businessId}`,
    );

    return {
      created: result.count,
      skipped,
      total: dates.length,
      reason: dto.reason || null,
      startDate: dto.startDate,
      endDate: dto.endDate,
    };
  }

  async getHolidays(businessId: string, startDate?: string, endDate?: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    const where: any = { businessId };

    // ⚠️ CRITICAL: استفاده از parseISOtoUTC برای جلوگیری از drift
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = parseISOtoUTC(startDate);
      if (endDate) {
        const end = parseISOtoUTC(endDate);
        end.setUTCHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    return this.prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async removeHoliday(id: string, userId: string) {
    const holiday = await this.prisma.holiday.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!holiday) {
      throw new NotFoundException('تعطیلی یافت نشد');
    }

    // بررسی مالکیت business
    await this.businessesService.checkOwnership(holiday.businessId, userId);

    await this.prisma.holiday.delete({
      where: { id },
    });

    return { message: 'تعطیلی با موفقیت حذف شد' };
  }
}