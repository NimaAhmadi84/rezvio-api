import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffDateBreakDto } from './dto/create-staff-date-breaks.dto';

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const getLocalTodayISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateToUTC = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

@Injectable()
export class StaffDateBreaksService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateOwnership(staffId: string, userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: { business: true },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    if (staff.business.ownerId !== userId) {
      throw new ForbiddenException('دسترسی غیرمجاز به این کارمند');
    }

    return staff;
  }

  private hasTimeOverlap(
    aStart: string,
    aEnd: string,
    bStart: string,
    bEnd: string,
  ): boolean {
    const aStartMin = timeToMinutes(aStart);
    const aEndMin = timeToMinutes(aEnd);
    const bStartMin = timeToMinutes(bStart);
    const bEndMin = timeToMinutes(bEnd);

    return aStartMin < bEndMin && aEndMin > bStartMin;
  }

  private validateBreaks(breaks: StaffDateBreakDto[]) {
    const todayIso = getLocalTodayISO();
    const perDate = new Map<string, StaffDateBreakDto[]>();

    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i];
      const startMin = timeToMinutes(b.startTime);
      const endMin = timeToMinutes(b.endTime);

      if (endMin <= startMin) {
        throw new BadRequestException(
          `ردیف ${i + 1}: ساعت پایان باید بعد از شروع باشد`,
        );
      }

      if (endMin - startMin < 10) {
        throw new BadRequestException(
          `ردیف ${i + 1}: طول بازه باید حداقل ۱۰ دقیقه باشد`,
        );
      }

      if (b.date < todayIso) {
        throw new BadRequestException(
          `ردیف ${i + 1}: تاریخ نمی‌تواند در گذشته باشد`,
        );
      }

      const list = perDate.get(b.date) || [];
      list.push(b);
      perDate.set(b.date, list);
    }

    perDate.forEach((list, date) => {
      if (list.length > 5) {
        throw new BadRequestException(
          `حداکثر ۵ بازه در تاریخ ${date} مجاز است`,
        );
      }

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (
            this.hasTimeOverlap(
              list[i].startTime,
              list[i].endTime,
              list[j].startTime,
              list[j].endTime,
            )
          ) {
            throw new BadRequestException(
              `دو بازه در تاریخ ${date} با هم تداخل دارند`,
            );
          }
        }
      }
    });
  }

  async getBreaks(staffId: string, userId: string) {
    await this.validateOwnership(staffId, userId);

    return this.prisma.staffDateBreak.findMany({
      where: { staffId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setBreaks(
    staffId: string,
    userId: string,
    breaks: StaffDateBreakDto[],
  ) {
    const staff = await this.validateOwnership(staffId, userId);

    this.validateBreaks(breaks);

    if (breaks.length > 0) {
      const dates = [...new Set(breaks.map((b) => b.date))];
      const dateObjects = dates.map((d) => parseDateToUTC(d));

      // ★ چک تعطیلات رسمی کسب‌وکار
      const holidays = await this.prisma.holiday.findMany({
        where: {
          businessId: staff.businessId,
          date: { in: dateObjects },
        },
        select: { date: true },
      });

      if (holidays.length > 0) {
        const holidayDates = new Set(
          holidays.map((h) => {
            const y = h.date.getUTCFullYear();
            const m = String(h.date.getUTCMonth() + 1).padStart(2, '0');
            const d = String(h.date.getUTCDate()).padStart(2, '0');

            return `${y}-${m}-${d}`;
          }),
        );

        const conflictingDates = dates.filter((d) => holidayDates.has(d));

        throw new BadRequestException(
          `نمی‌توانید برای تاریخ‌های ${conflictingDates.join('، ')} غیبت تعریف کنید — این روزها تعطیل رسمی کسب‌وکار هستند`,
        );
      }

      // ★ چک روزهای تعطیل هفتگی
      const businessHours = await this.prisma.businessHour.findMany({
        where: { businessId: staff.businessId },
        select: { dayOfWeek: true },
      });

      const workingDays = new Set(
        businessHours.map((h) => h.dayOfWeek),
      );

      const dayNames = [
        'شنبه',
        'یکشنبه',
        'دوشنبه',
        'سه‌شنبه',
        'چهارشنبه',
        'پنج‌شنبه',
        'جمعه',
      ];

      for (const b of breaks) {
        const dateObj = parseDateToUTC(b.date);
        const jsDay = dateObj.getUTCDay();
        const iranDay = (jsDay + 1) % 7;

        if (!workingDays.has(iranDay)) {
          throw new BadRequestException(
            `نمی‌توانید برای ${b.date} (${dayNames[iranDay]}) غیبت تعریف کنید — این روز در کسب‌وکار تعطیل است`,
          );
        }
      }

      // ★ NEW: چک تداخل غیبت موردی با غیبت هفتگی کارمند
      const weeklyBreaks = await this.prisma.staffBreak.findMany({
        where: { staffId },
        select: {
          dayOfWeek: true,
          startTime: true,
          endTime: true,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });

      for (const b of breaks) {
        const dateObj = parseDateToUTC(b.date);
        const jsDay = dateObj.getUTCDay();
        const iranDay = (jsDay + 1) % 7;

        const overlappingWeeklyBreak = weeklyBreaks.find(
          (weeklyBreak) =>
            weeklyBreak.dayOfWeek === iranDay &&
            this.hasTimeOverlap(
              b.startTime,
              b.endTime,
              weeklyBreak.startTime,
              weeklyBreak.endTime,
            ),
        );

        if (overlappingWeeklyBreak) {
          throw new BadRequestException(
            `غیبت موردی در تاریخ ${b.date} (${dayNames[iranDay]}) با غیبت هفتگی کارمند در ساعت ${overlappingWeeklyBreak.startTime} تا ${overlappingWeeklyBreak.endTime} تداخل دارد`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.staffDateBreak.deleteMany({ where: { staffId } });

      if (breaks.length === 0) return [];

      await tx.staffDateBreak.createMany({
        data: breaks.map((b) => ({
          staffId,
          date: parseDateToUTC(b.date),
          startTime: b.startTime,
          endTime: b.endTime,
          reason: b.reason?.trim() ? b.reason.trim() : null,
        })),
      });

      return tx.staffDateBreak.findMany({
        where: { staffId },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });
  }
}