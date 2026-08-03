import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SlotResult {
  startTime: string; // فرمت HH:MM
  endTime: string;   // فرمت HH:MM
}

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * محاسبه slot های آزاد برای یک business/service/staff/date
   */
  async getAvailableSlots(
    businessSlug: string,
    serviceId: string,
    staffId: string,
    dateString: string,
  ): Promise<SlotResult[]> {
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

    // 5. تبدیل تاریخ string به Date و محاسبه dayOfWeek
    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('تاریخ نامعتبر است');
    }

    // محاسبه dayOfWeek با فرمت ایران (شنبه=0, یکشنبه=1, ..., جمعه=6)
    // JavaScript: Sunday=0, Monday=1, ..., Saturday=6
    // Iran: Saturday=0, Sunday=1, ..., Friday=6
    const jsDayOfWeek = targetDate.getDay();
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
      return [];
    }

    // 7. چک کردن تعطیلات رسمی
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

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
      return [];
    }

    // 8. گرفتن همه bookings این staff در این روز (غیر از CANCELLED)
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        businessId: business.id,
        staffId: staffId,
        status: {
          not: 'CANCELLED',
        },
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

    // 9. تولید slot های ممکن
    const durationMinutes = service.durationMinutes;
    const slots = this.generateSlots(
      businessHour.openTime,
      businessHour.closeTime,
      durationMinutes,
      existingBookings,
      targetDate,
    );

    return slots;
  }

  /**
   * تولید slot های آزاد با توجه به ساعات کاری و bookings موجود
   */
  private generateSlots(
    openTime: string,
    closeTime: string,
    durationMinutes: number,
    existingBookings: Array<{ startTime: Date; endTime: Date }>,
    targetDate: Date,
  ): SlotResult[] {
    const slots: SlotResult[] = [];

    const openMinutes = this.timeToMinutes(openTime);
    const closeMinutes = this.timeToMinutes(closeTime);

    const now = new Date();
    const isToday =
      targetDate.getFullYear() === now.getFullYear() &&
      targetDate.getMonth() === now.getMonth() &&
      targetDate.getDate() === now.getDate();

    // فاصله بین slot ها: 30 دقیقه یا duration (هر کدام کوچکتر)
    const intervalMinutes = Math.min(30, durationMinutes);

    for (
      let currentMinute = openMinutes;
      currentMinute + durationMinutes <= closeMinutes;
      currentMinute += intervalMinutes
    ) {
      const slotStartTime = currentMinute;
      const slotEndTime = currentMinute + durationMinutes;

      // چک 1: اگر امروز است، آیا این slot در گذشته نیست؟
      if (isToday) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (slotStartTime <= nowMinutes) {
          continue;
        }
      }

      // چک 2: آیا با هیچ booking موجودی overlap ندارد؟
      const hasOverlap = existingBookings.some((booking) => {
        const bookingStartMinutes =
          booking.startTime.getHours() * 60 + booking.startTime.getMinutes();
        const bookingEndMinutes =
          booking.endTime.getHours() * 60 + booking.endTime.getMinutes();

        // قانون overlap: A.startTime < B.endTime AND A.endTime > B.startTime
        return slotStartTime < bookingEndMinutes && slotEndTime > bookingStartMinutes;
      });

      if (!hasOverlap) {
        slots.push({
          startTime: this.minutesToTime(slotStartTime),
          endTime: this.minutesToTime(slotEndTime),
        });
      }
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
}
