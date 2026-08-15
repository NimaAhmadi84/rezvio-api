import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * آمار کلی برای landing page
   * - تعداد کسب‌وکارها
   * - تعداد رزروها (کل)
   * - تعداد شهرهای یکتا
   * - میانگین امتیاز (فعلاً placeholder چون Review نداریم)
   */
  async getLandingStats() {
    // اجرای موازی همه query ها برای performance بهتر
    const [
      businessesCount,
      bookingsCount,
      activeCities,
      categoriesCount,
      activeOwners,
    ] = await Promise.all([
      // تعداد کسب‌وکارها
      this.prisma.business.count(),

      // تعداد رزروها (همه، بدون فیلتر status)
      this.prisma.booking.count(),

      // تعداد شهرهای یکتا
      this.prisma.business
        .groupBy({
          by: ['address'],
          where: { address: { not: null } },
        })
        .then((groups) => {
          // استخراج شهر از آدرس (ساده: اولین کلمه قبل از کاما یا فاصله)
          const cities = new Set<string>();
          groups.forEach((group) => {
            if (group.address) {
              const city = group.address
                .split(/[,،\-\s]/)[0]
                .trim()
                .replace(/^(استان|شهر)\s+/, '');
              if (city) cities.add(city);
            }
          });
          return cities.size;
        }),

      // تعداد دسته‌بندی‌ها
      this.prisma.category.count(),

      // تعداد OWNER های فعال
      this.prisma.user.count({
        where: { role: 'OWNER' },
      }),
    ]);

    const stats = {
      businessesCount,
      bookingsCount,
      activeCities,
      categoriesCount,
      activeOwners,
      // میانگین امتیاز (placeholder تا Review system ساخته بشه)
      averageRating: 4.9,
    };

    this.logger.debug(`📊 Landing stats: ${JSON.stringify(stats)}`);
    return stats;
  }

  /**
   * آمار داخلی برای admin dashboard (بعداً)
   */
  async getAdminStats() {
    const [
      totalUsers,
      totalBusinesses,
      totalBookings,
      pendingBookings,
      completedBookings,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.business.count(),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: 'PENDING' } }),
      this.prisma.booking.count({ where: { status: 'COMPLETED' } }),
      // Placeholder برای درآمد (بعداً از payment gateway)
      Promise.resolve(0),
    ]);

    return {
      totalUsers,
      totalBusinesses,
      totalBookings,
      pendingBookings,
      completedBookings,
      totalRevenue,
    };
  }
}
