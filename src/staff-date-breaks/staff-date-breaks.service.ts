import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffDateBreakDto } from './dto/create-staff-date-breaks.dto';

// ──── Helper: تبدیل "HH:MM" به دقیقه از نیمه‌شب ────
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// ──── Helper: امروز سرور به صورت YYYY-MM-DD (وقت محلی) ────
const getLocalTodayISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ──── Helper: تبدیل YYYY-MM-DD به Date ساعت صفر UTC (برای ستون @db.Date) ────
const parseDateToUTC = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

@Injectable()
export class StaffDateBreaksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * بررسی مالکیت: کارمند → کسب‌وکار → مالک (defense in depth)
   */
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

  /**
   * اعتبارسنجی لیست غیبت‌های موردی
   * - پایان بعد از شروع + حداقل ۱۰ دقیقه
   * - تاریخ نباید در گذشته باشد
   * - بدون تداخل در یک تاریخ واحد
   * - حداکثر ۵ بازه در هر تاریخ
   */
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
          const aStart = timeToMinutes(list[i].startTime);
          const aEnd = timeToMinutes(list[i].endTime);
          const bStart = timeToMinutes(list[j].startTime);
          const bEnd = timeToMinutes(list[j].endTime);
          if (aStart < bEnd && aEnd > bStart) {
            throw new BadRequestException(
              `دو بازه در تاریخ ${date} با هم تداخل دارند`,
            );
          }
        }
      }
    });
  }

  /**
   * دریافت غیبت‌های موردی یک کارمند (مرتب بر اساس تاریخ)
   * GET /availability/staff-date-breaks/:staffId
   */
  async getBreaks(staffId: string, userId: string) {
    await this.validateOwnership(staffId, userId);

    return this.prisma.staffDateBreak.findMany({
      where: { staffId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * جایگزینی کامل لیست غیبت‌های موردی (replace-all)
   * POST /availability/staff-date-breaks/:staffId
   */
  async setBreaks(staffId: string, userId: string, breaks: StaffDateBreakDto[]) {
    await this.validateOwnership(staffId, userId);
    this.validateBreaks(breaks);

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