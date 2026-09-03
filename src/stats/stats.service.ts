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
    const [
      businessesCount,
      bookingsCount,
      activeCities,
      categoriesCount,
      activeOwners,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.booking.count(),
      this.prisma.business
        .groupBy({
          by: ['address'],
          where: { address: { not: null } },
        })
        .then((groups) => {
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
      this.prisma.category.count(),
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

  /**
   * آمار داشبورد برای OWNER/ADMIN
   * 
   * این متد aggregated stats کلی از همه کسب‌وکارهای owner رو برمی‌گردونه.
   * حل N+1 Problem: همه رزروها رو در یک query می‌گیریم، نه N query جدا.
   * 
   * @param userId - ID کاربر authenticated
   * @returns آمار کلی شامل totalBusinesses, todayBookings, weekBookings, pendingBookings, totalBookings
   */
  async getDashboardStats(userId: string) {
    // ──── Step 1: همه کسب‌وکارهای owner رو بگیر ────
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (businesses.length === 0) {
      return {
        totalBusinesses: 0,
        todayBookings: 0,
        weekBookings: 0,
        pendingBookings: 0,
        totalBookings: 0,
      };
    }

    const businessIds = businesses.map((b) => b.id);

    // ──── Step 2: محاسبه محدوده‌های زمانی ────
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekFromNow = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // ──── Step 3: همه رزروهای owner رو در یک query بگیر ────
    const allBookings = await this.prisma.booking.findMany({
      where: {
        businessId: { in: businessIds },
      },
      select: {
        startTime: true,
        status: true,
      },
    });

    // ──── Step 4: محاسبه stats در memory (سریع‌تر از multiple queries) ────
    const todayBookings = allBookings.filter((b) => {
      const t = new Date(b.startTime);
      return t >= todayStart && t < todayEnd;
    }).length;

    const weekBookings = allBookings.filter((b) => {
      const t = new Date(b.startTime);
      return t >= todayStart && t < weekFromNow;
    }).length;

    const pendingBookings = allBookings.filter(
      (b) => b.status === 'PENDING',
    ).length;

    const stats = {
      totalBusinesses: businesses.length,
      todayBookings,
      weekBookings,
      pendingBookings,
      totalBookings: allBookings.length,
    };

    this.logger.debug(
      `📊 Dashboard stats for user ${userId}: ${JSON.stringify(stats)}`,
    );

    return stats;
  }
}