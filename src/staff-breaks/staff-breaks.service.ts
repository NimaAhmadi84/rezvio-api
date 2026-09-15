import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffBreakDto } from './dto/set-staff-breaks.dto';

// ──── Helper: تبدیل "HH:MM" به دقیقه از نیمه‌شب ────
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

@Injectable()
export class StaffBreaksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * بررسی اینکه کارمند متعلق به کسب‌وکار مالک است (defense in depth)
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
   * بررسی overlap بین بازه‌ها
   * قانون overlap: A.startTime < B.endTime AND A.endTime > B.startTime
   */
  private validateNoOverlaps(breaks: StaffBreakDto[]) {
    for (let i = 0; i < breaks.length; i++) {
      const a = breaks[i];
      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);

      // چک: endTime باید بعد از startTime باشد
      if (aEnd <= aStart) {
        throw new BadRequestException(
          `بازه ${i + 1}: ساعت پایان باید بعد از شروع باشد`,
        );
      }

      // چک: حداقل ۱۰ دقیقه
      if (aEnd - aStart < 10) {
        throw new BadRequestException(
          `بازه ${i + 1}: طول بازه باید حداقل ۱۰ دقیقه باشد`,
        );
      }

      // چک overlap با بقیه بازه‌ها
      for (let j = i + 1; j < breaks.length; j++) {
        const b = breaks[j];

        // فقط بازه‌های همان روز را چک کن
        if (a.dayOfWeek !== b.dayOfWeek) continue;

        const bStart = timeToMinutes(b.startTime);
        const bEnd = timeToMinutes(b.endTime);

        if (aStart < bEnd && aEnd > bStart) {
          throw new BadRequestException(
            `بازه ${i + 1} و ${j + 1} در روز یکسان با هم تداخل دارند`,
          );
        }
      }
    }
  }

  /**
   * دریافت breaks یک کارمند
   * GET /availability/staff-breaks/:staffId
   */
  async getBreaks(staffId: string, userId: string) {
    await this.validateOwnership(staffId, userId);

    return this.prisma.staffBreak.findMany({
      where: { staffId },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });
  }

  /**
   * جایگزینی کامل breaks یک کارمند (replace-all)
   * POST /availability/staff-breaks/:staffId
   */
  async setBreaks(staffId: string, userId: string, breaks: StaffBreakDto[]) {
    // 1. Ownership check
    await this.validateOwnership(staffId, userId);

    // 2. Validation: بررسی overlap
    this.validateNoOverlaps(breaks);

    // 3. Transaction: delete old + create new
    return this.prisma.$transaction(async (tx) => {
      // حذف همه breaks فعلی
      await tx.staffBreak.deleteMany({
        where: { staffId },
      });

      // ساخت breaks جدید
      if (breaks.length === 0) {
        return [];
      }

      return tx.staffBreak.createMany({
        data: breaks.map((b) => ({
          staffId,
          dayOfWeek: b.dayOfWeek,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
      });
    });
  }
}