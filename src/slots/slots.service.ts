import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SlotResult {
  startTime: string; // فرمت HH:MM
  endTime: string;   // فرمت HH:MM
}

export type SlotEmptyReason = 'HOLIDAY' | 'WEEKLY_CLOSED' | 'FULL' | 'PAST' | 'ON_BREAK' | null;

// ──── ساختار داده break برای type-safety ────
interface BreakInfo {
  startTime: string; // HH:MM (وقت محلی)
  endTime: string;   // HH:MM (وقت محلی)
}

// ──── UTC Date Helper (فقط برای ساخت تاریخ دیواری از YYYY-MM-DD) ────
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

// امروز در timezone محلی سرور به صورت YYYY-MM-DD
const getLocalTodayISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ──── Helper: تبدیل "HH:MM" به دقیقه از نیمه‌شب ────
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * محاسبه slot های آزاد برای یک business/service/staff/date
   *
   * لایه‌های فیلتر:
   * 1. ساعات کاری کسب‌وکار (BusinessHour)
   * 2. تعطیلات رسمی کسب‌وکار (Holiday)
   * 3. غیبت هفتگی کارمند (StaffBreak)
   * 4. غیبت موردی کارمند در همان تاریخ (StaffDateBreak)
   * 5. رزروهای موجود کارمند (Booking)
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
    const targetDate = parseISOtoUTC(dateString);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('تاریخ نامعتبر است');
    }

    // محاسبه dayOfWeek با فرمت ایران (شنبه=0, یکشنبه=1, ..., جمعه=6)
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
      return { slots: [], emptyReason: 'WEEKLY_CLOSED' };
    }

    // 7. چک کردن تعطیلات رسمی کسب‌وکار
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
      return { slots: [], emptyReason: 'HOLIDAY' };
    }

    // 8. گرفتن غیبت‌های کارمند برای این روز (هفتگی + موردی)
    const [weeklyBreaks, dateBreaks] = await Promise.all([
      this.prisma.staffBreak.findMany({
        where: { staffId, dayOfWeek: iranDayOfWeek },
        select: { startTime: true, endTime: true },
      }),
      this.prisma.staffDateBreak.findMany({
        where: { staffId, date: targetDate },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const staffBreaks: BreakInfo[] = [...weeklyBreaks, ...dateBreaks];

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

    // 10. ساخت slot های آزاد
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
      const allSlotsWithoutBreakCheck = this.generateSlots(
        businessHour.openTime,
        businessHour.closeTime,
        durationMinutes,
        existingBookings,
        dateString,
        [],
      );

      if (allSlotsWithoutBreakCheck.length === 0) {
        const todayIso = getLocalTodayISO();
        const isToday = dateString === todayIso;
        emptyReason = isToday ? 'PAST' : 'FULL';
      } else {
        emptyReason = 'ON_BREAK';
      }
    }

    return { slots, emptyReason };
  }

  /**
   * تولید slot های آزاد با فیلتر کردن:
   * - زمان‌های گذشته (اگر امروز است)
   * - رزروهای موجود (overlap)
   * - غیبت‌های کارمند (هفتگی + موردی)
   */
  private generateSlots(
    openTime: string,
    closeTime: string,
    durationMinutes: number,
    existingBookings: Array<{ startTime: Date; endTime: Date }>,
    targetDateIso: string,
    staffBreaks: BreakInfo[],
  ): SlotResult[] {
    const slots: SlotResult[] = [];

    const openMinutes = timeToMinutes(openTime);
    const closeMinutes = timeToMinutes(closeTime);

    const todayIso = getLocalTodayISO();
    const isToday = targetDateIso === todayIso;

    // فاصله بین slot ها = duration خدمت (مدل Fresha/Booksy)
    const intervalMinutes = durationMinutes;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // ──── تبدیل غیبت‌ها به دقیقه (وقت محلی) ────
    const breaksInMinutes = staffBreaks.map((b) => ({
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime),
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
      // ⚠️ CRITICAL: ساعت دیواری LOCAL — رزروها بدون timezone parse شده‌اند
      // و slot ها هم بر اساس ساعت دیواری محلی ساخته می‌شوند.
      const hasBookingOverlap = existingBookings.some((booking) => {
        const bookingStartMinutes =
          booking.startTime.getHours() * 60 + booking.startTime.getMinutes();
        const bookingEndMinutes =
          booking.endTime.getHours() * 60 + booking.endTime.getMinutes();

        // اگر endTime در روز بعد است (مثلاً رزرو ۲۳:۳۰ تا ۰:۳۰)
        const adjustedEnd = bookingEndMinutes < bookingStartMinutes
          ? bookingEndMinutes + 24 * 60
          : bookingEndMinutes;

        return slotStartTime < adjustedEnd && slotEndTime > bookingStartMinutes;
      });

      if (hasBookingOverlap) {
        continue;
      }

      // چک 3: آیا با هیچ غیبت کارمندی overlap ندارد؟ (هفتگی + موردی)
      const hasBreakOverlap = breaksInMinutes.some((brk) => {
        return slotStartTime < brk.end && slotEndTime > brk.start;
      });

      if (hasBreakOverlap) {
        continue;
      }

      slots.push({
        startTime: this.minutesToTime(slotStartTime),
        endTime: this.minutesToTime(slotEndTime),
      });
    }

    return slots;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * پیدا کردن نزدیک‌ترین روز دارای اسلات خالی در ۶۰ روز آینده
   */
  async findNextAvailable(businessSlug: string, serviceId: string, staffId: string) {
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

    const staffService = await this.prisma.staffService.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
    });
    if (!staffService) {
      throw new BadRequestException('این کارمند این خدمت را ارائه نمی‌دهد');
    }

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