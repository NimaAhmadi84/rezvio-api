import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessHourDto } from './dto/create-business-hour.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { BusinessesService } from '../businesses/businesses.service';

@Injectable()
export class AvailabilityService {
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

    const holiday = await this.prisma.holiday.create({
      data: {
        businessId: dto.businessId,
        date: new Date(dto.date),
        reason: dto.reason,
      },
    });

    return holiday;
  }

  async getHolidays(businessId: string, startDate?: string, endDate?: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    const where: any = { businessId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
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
