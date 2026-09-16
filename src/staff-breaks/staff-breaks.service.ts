import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffBreakDto } from './dto/set-staff-breaks.dto';

@Injectable()
export class StaffBreaksService {
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

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private validateBreaks(breaks: StaffBreakDto[]) {
    const perDay = new Map<number, StaffBreakDto[]>();

    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i];
      const startMin = this.timeToMinutes(b.startTime);
      const endMin = this.timeToMinutes(b.endTime);

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
      if (b.dayOfWeek < 0 || b.dayOfWeek > 6) {
        throw new BadRequestException(
          `ردیف ${i + 1}: روز هفته باید بین ۰ (شنبه) تا ۶ (جمعه) باشد`,
        );
      }

      const list = perDay.get(b.dayOfWeek) || [];
      list.push(b);
      perDay.set(b.dayOfWeek, list);
    }

    perDay.forEach((list, day) => {
      if (list.length > 5) {
        const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
        throw new BadRequestException(
          `حداکثر ۵ بازه در ${dayNames[day]} مجاز است`,
        );
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const aStart = this.timeToMinutes(list[i].startTime);
          const aEnd = this.timeToMinutes(list[i].endTime);
          const bStart = this.timeToMinutes(list[j].startTime);
          const bEnd = this.timeToMinutes(list[j].endTime);
          if (aStart < bEnd && aEnd > bStart) {
            throw new BadRequestException(
              `دو بازه در ${['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'][day]} با هم تداخل دارند`,
            );
          }
        }
      }
    });
  }

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

  async setBreaks(staffId: string, userId: string, breaks: StaffBreakDto[]) {
    const staff = await this.validateOwnership(staffId, userId);
    this.validateBreaks(breaks);

    // ★ NEW: چک روزهای تعطیل هفتگی کسب‌وکار
    const businessHours = await this.prisma.businessHour.findMany({
      where: { businessId: staff.businessId },
      select: { dayOfWeek: true },
    });

    const workingDays = new Set(businessHours.map((h) => h.dayOfWeek));
    const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

    for (const b of breaks) {
      if (!workingDays.has(b.dayOfWeek)) {
        throw new BadRequestException(
          `نمی‌توانید برای ${dayNames[b.dayOfWeek]} استراحت تعریف کنید — این روز در کسب‌وکار تعطیل است`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.staffBreak.deleteMany({ where: { staffId } });

      if (breaks.length === 0) return [];

      await tx.staffBreak.createMany({
        data: breaks.map((b) => ({
          staffId,
          dayOfWeek: b.dayOfWeek,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
      });

      return tx.staffBreak.findMany({
        where: { staffId },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startTime: 'asc' },
        ],
      });
    });
  }
}