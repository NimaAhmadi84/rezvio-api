import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SlotResult {
  startTime: string; // فرمت HH:MM
  endTime: string;   // فرمت HH:MM
}

export type SlotEmptyReason = 'HOLIDAY' | 'WEEKLY_CLOSED' | 'FULL' | 'PAST' | null;

// ──── UTC Date Helpers (جلوگیری از timezone drift ایران) ────
// چرا؟ new Date('2026-09-15') در ایران می‌شود 2026-09-14T20:30:00Z (یک روز قبل)
// این helper ها تاریخ را دقیقاً همان روزی که کاربر گفته می‌سازند
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

// امروز در timezone محلی کاربر به صورت YYYY-MM-DD
const getLocalTodayISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * محاسبه slot های آزاد برای یک business/service/staff/date
   *
   * الگوریتم:
   * 1. validation های business/service/staff/M2M
   * 2. چک ساعات کاری کسب‌وکار
   * 3. چک تعطیلات رسمی کسب‌وکار
   * 4. چک بازه‌های غیرقابل رزرو کارمند (StaffBreak)
   * 5. چک رزروهای موجود (overlap)
   * 6. تولید slot های آزاد
   */
  async getAvailableSlots(
    businessSlug: string,
    serviceId: string,
    staffId: string,
    dateString: string,
  ): Promise<{ slots: SlotResult[]; emptyReason: SlotEmptyReason }> {
    // 1. پیدا کردن business از slug
    const business = await this.prisma.business.findUnique({
      where: { slug: businessSlug },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    // 2. اعتبارسنجی service متعلق به این business است
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        businessId: business.id,
      },
    });

    if (!service) {
      throw new NotFoundException('خدمت یافت نشد یا متعلق به این کسب‌وکار نیست');
    }

    // 3. اعتبارسنجی staff متعلق به این business است
    const staff = await this.prisma.staff.findFirst({
      where: {
        id: staffId,
        businessId: business.id,
      },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد یا متعلق به این کسب‌وکار نیست');
    }

    // 4. بررسی اینکه staff این service را ارائه می‌دهد (رابطه M2M)
    const staffService = await this.prisma.staffService.findUnique({
      where: {
        staffId_serviceId: {
          staffId,
          serviceId,
        },
      },
    });

    if (!staffService) {
      throw new BadRequestException('این کارمند این خدمت را ارائه نمی‌دهد');
    }

    // 5. تبدیل تاریخ string به Date با UTC helper
    // ⚠️ CRITICAL: استفاده از parseISOtoUTC برای جلوگیری از timezone drift ایران
    const targetDate = parseISOtoUTC(dateString);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('تاریخ نامعتبر است');
    }

    // محاسبه dayOfWeek با فرمت ایران (شنبه=0, یکشنبه=1, ..., جمعه=6)
    // JavaScript: Sunday=0, Monday=1, ..., Saturday=6
    // Iran: Saturday=0, Sunday=1, ..., Friday=6
    const jsDayOfWeek = targetDate.getUTCDay();
    const iranDayOfWeek = (jsDayOfWeek + 1) % 7;

    // 6. گرفتن ساعات کاری برای این روز هفته
    const businessHour = await this.prisma.businessHour.findFirst({
      where: {
        businessId: business.id,
        dayOfWeek: iranDayOfWeek,
      },
    });

    if (!businessHour) {
      // این روز تعطیل است (ساعت کاری تعریف نشده)
      return { slots: [], emptyReason: 'WEEKLY_CLOSED' };
    }

    // 7. چک کردن تعطیلات رسمی کسب‌وکار
    // ⚠️ CRITICAL: استفاده از UTC برای جلوگیری از overlap با روزهای مجاور
    const startOfDay = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
      0, 0, 0, 0,
    ));

    const endOfDay = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
      23, 59, 59, 999,
    ));

    const holiday = await this.prisma.holiday.findFirst({
      where: {
        businessId: business.id,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (holiday) {
      // این روز تعطیل رسمی است
      return { slots: [], emptyReason: 'HOLIDAY' };
    }

    // 8. گرفتن breaks این کارمند برای این روز هفته
    // بازه‌هایی که کارمند در آن ساعات حضور ندارد (ناهار شخصی، استراحت و...)
    const staffBreaks = await this.prisma.staffBreak.findMany({
      where: {
        staffId,
        dayOfWeek: iranDayOfWeek,
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // 9. گرفتن رزروهای موجود این staff در این روز
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        staffId,
        businessId: business.id,
        status: { not: 'CANCELLED' },
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // 10. ساخت slot های آزاد (با فیلتر staff breaks + existing bookings)
    const durationMinutes = service.durationMinutes;
    const slots = this.generateSlots(
      businessHour.openTime,
      businessHour.closeTime,
      durationMinutes,
      existingBookings,
      dateString,
      staffBreaks,
    );

    // دلیل خالی بودن: برای پیام دقیق در فرانت‌اند
    let emptyReason: SlotEmptyReason = null;
    if (slots.length === 0) {
      // مقایسه تاریخ (نه ساعت) — اگر targetDate با امروز محلی برابر باشد
      const todayIso = getLocalTodayISO();
      const isToday = dateString === todayIso;
      emptyReason = isToday ? 'PAST' : 'FULL';
    }

    return { slots, emptyReason };
  }

  /**
   * تولید slot های آزاد با فیلتر کردن:
   * - زمان‌های گذشته (اگر امروز است)
   * - رزروهای موجود (overlap)
   * - بازه‌های غیرقابل رزرو کارمند (overlap)
   */
  private generateSlots(
    openTime: string,
    closeTime: string,
    durationMinutes: number,
    existingBookings: Array<{ startTime: Date; endTime: Date }>,
    targetDateIso: string,
    staffBreaks: Array<{ startTime: string; endTime: string }> = [],
  ): SlotResult[] {
    const slots: SlotResult[] = [];

    const openMinutes = this.timeToMinutes(openTime);
    const closeMinutes = this.timeToMinutes(closeTime);

    // امروز بودن: مقایسه ISO string با today محلی
    const todayIso = getLocalTodayISO();
    const isToday = targetDateIso === todayIso;

    // فاصله بین slot ها = duration خدمت (مدل Fresha/Booksy)
    // این باعث می‌شه خدمت ۴۰ دقیقه‌ای slot های ۴۰ دقیقه‌ای داشته باشه
    // (مثلاً ۱۶:۱۰، ۱۶:۵۰، ۱۷:۳۰) بدون gap و بدون overlap ریاضی
    const intervalMinutes = durationMinutes;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // ──── تبدیل staff breaks به دقیقه از نیمه‌شب ────
    // زمان‌ها به صورت HH:MM محلی ذخیره شده‌اند و با ساعت دیواری قابل مقایسه‌اند
    const breaksInMinutes = staffBreaks.map((brk) => ({
      start: this.timeToMinutes(brk.startTime),
      end: this.timeToMinutes(brk.endTime),
    }));

    for (
      let currentMinute = openMinutes;
      currentMinute + durationMinutes <= closeMinutes;
      currentMinute += intervalMinutes
    ) {
      const slotStartTime = currentMinute;
      const slotEndTime = currentMinute + durationMinutes;

      // چک 1: اگر امروز است، آیا این slot در گذشته نیست؟
      if (isToday) {
        if (slotStartTime <= nowMinutes) {
          continue;
        }
      }

      // چک 2: آیا با هیچ booking موجودی overlap ندارد؟
      const hasBookingOverlap = existingBookings.some((booking) => {
        // تبدیل به دقیقه از نیمه‌شب — با UTC برای consistency
        const bookingStartMinutes =
          booking.startTime.getUTCHours() * 60 + booking.startTime.getUTCMinutes();
        const bookingEndMinutes =
          booking.endTime.getUTCHours() * 60 + booking.endTime.getUTCMinutes();

        // اگر endTime در روز بعد است (مثلاً رزرو ۲۳:۳۰ تا ۰۰:۳۰)
        const adjustedEnd = bookingEndMinutes < bookingStartMinutes
          ? bookingEndMinutes + 24 * 60
          : bookingEndMinutes;

        // قانون overlap: A.startTime < B.endTime AND A.endTime > B.startTime
        return slotStartTime < adjustedEnd && slotEndTime > bookingStartMinutes;
      });

      if (hasBookingOverlap) {
        continue;
      }

      // چک 3: آیا با هیچ break کارمندی overlap ندارد؟
      const hasStaffBreakOverlap = breaksInMinutes.some((brk) => {
        return slotStartTime < brk.end && slotEndTime > brk.start;
      });

      if (hasStaffBreakOverlap) {
        continue;
      }

      slots.push({
        startTime: this.minutesToTime(slotStartTime),
        endTime: this.minutesToTime(slotEndTime),
      });
    }

    return slots;
  }

  /**
   * تبدیل string زمان (HH:MM) به دقیقه از شروع روز
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * تبدیل دقیقه از شروع روز به string زمان (HH:MM)
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * پیدا کردن نزدیک‌ترین روز دارای اسلات خالی در ۶۰ روز آینده
   * برای auto-select در فرانت‌اند استفاده می‌شود
   */
  async findNextAvailable(businessSlug: string, serviceId: string, staffId: string) {
    // همان validation های getAvailableSlots
    const business = await this.prisma.business.findUnique({
      where: { slug: businessSlug },
    });
    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId: business.id },
    });
    if (!service) {
      throw new NotFoundException('خدمت یافت نشد یا متعلق به این کسب‌وکار نیست');
    }

    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, businessId: business.id },
    });
    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد یا متعلق به این کسب‌وکار نیست');
    }

    // بررسی M2M staff-service
    const staffService = await this.prisma.staffService.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
    });
    if (!staffService) {
      throw new BadRequestException('این کارمند این خدمت را ارائه نمی‌دهد');
    }

    // اسکن ۶۰ روز از امروز محلی
    const todayIso = getLocalTodayISO();
    const todayDate = parseISOtoUTC(todayIso);

    for (let offset = 0; offset < 60; offset++) {
      const cursor = new Date(todayDate);
      cursor.setUTCDate(cursor.getUTCDate() + offset);
      const dateStr = toUTCISO(cursor);

      const result = await this.getAvailableSlots(businessSlug, serviceId, staffId, dateStr);

      if (result.slots.length > 0) {
        return {
          date: dateStr,
          slotsCount: result.slots.length,
          firstSlot: result.slots[0],
        };
      }
    }

    return { date: null, slotsCount: 0, firstSlot: null };
  }
}