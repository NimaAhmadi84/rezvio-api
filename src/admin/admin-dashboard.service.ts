import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const IRAN_OFFSET_MS = 3.5 * HOUR_MS; // UTC+3:30

/**
 * شروع امروز به وقت ایران، برگردانده‌شده به UTC (طبق §6.30)
 */
function iranDayStartUtc(d: Date = new Date()): Date {
  const iranTime = new Date(d.getTime() + IRAN_OFFSET_MS);
  iranTime.setUTCHours(0, 0, 0, 0);
  return new Date(iranTime.getTime() - IRAN_OFFSET_MS);
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private static readonly CACHE_TTL_MS = 30 * 1000; // 30s

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getStats(days: number) {
    const cacheKey = `admin-dashboard:${days}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const todayStart = iranDayStartUtc(now);
    const last7Start = new Date(now.getTime() - 7 * DAY_MS);
    const prev7Start = new Date(now.getTime() - 14 * DAY_MS);
    const chartStart = new Date(now.getTime() - days * DAY_MS);

    const [
      usersByRole,
      usersBannedCount,
      businessesTotal,
      bookingsByStatus,
      reviewsAgg,
      viewsAgg,
      newUsersToday,
      newBookingsToday,
      completedToday,
      newUsers7,
      newBookings7,
      newUsersPrev7,
      newBookingsPrev7,
      recentBookings,
      recentUsers,
      recentAdminLogs,
      topBusinessesByBookings,
    ] = await this.prisma.$transaction([
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
        orderBy: { role: 'asc' },
      }),
      this.prisma.user.count({ where: { isBanned: true } }),
      this.prisma.business.count(),
      this.prisma.booking.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.businessReview.aggregate({
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.business.aggregate({ _sum: { viewsCount: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.booking.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.booking.findMany({
        where: {
          status: 'COMPLETED',
          startTime: { gte: todayStart },
        },
        select: { service: { select: { price: true } } },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: last7Start } } }),
      this.prisma.booking.count({ where: { createdAt: { gte: last7Start } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: prev7Start, lt: last7Start } },
      }),
      this.prisma.booking.count({
        where: { createdAt: { gte: prev7Start, lt: last7Start } },
      }),
      this.prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          business: { select: { id: true, name: true, slug: true } },
          service: { select: { id: true, name: true, price: true } },
        },
      }),
      this.prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, phone: true,
          role: true, isBanned: true, createdAt: true,
        },
      }),
      this.prisma.adminActivityLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: {
            select: { id: true, user: { select: { name: true, email: true } } },
          },
        },
      }),
      this.prisma.business.findMany({
        take: 5,
        orderBy: { bookingsCount: 'desc' },
        select: { id: true, name: true, slug: true, bookingsCount: true },
      }),
    ]);

    // ──── 7-day revenue (current vs previous) ────
    const [revenue7Raw] = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COALESCE(SUM(s.price), 0)::bigint AS total
      FROM "bookings" b
      LEFT JOIN "services" s ON b."serviceId" = s.id
      WHERE b.status::text = 'COMPLETED' AND b."startTime" >= ${last7Start}
    `;
    const [revenuePrev7Raw] = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COALESCE(SUM(s.price), 0)::bigint AS total
      FROM "bookings" b
      LEFT JOIN "services" s ON b."serviceId" = s.id
      WHERE b.status::text = 'COMPLETED'
        AND b."startTime" >= ${prev7Start}
        AND b."startTime" < ${last7Start}
    `;

    // ──── top businesses by revenue ────
    const topByRevenue = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; slug: string; revenue: bigint }>
    >`
      SELECT b.id, b.name, b.slug, COALESCE(SUM(s.price), 0)::bigint AS revenue
      FROM "businesses" b
      INNER JOIN "bookings" bk
        ON bk."businessId" = b.id
       AND bk.status::text = 'COMPLETED'
       AND bk."startTime" >= ${chartStart}
      LEFT JOIN "services" s ON bk."serviceId" = s.id
      GROUP BY b.id, b.name, b.slug
      HAVING COALESCE(SUM(s.price), 0) > 0
      ORDER BY revenue DESC
      LIMIT 5
    `;

    // ──── daily chart ────
    const chartBookings = await this.prisma.booking.findMany({
      where: { startTime: { gte: chartStart } },
      select: {
        startTime: true,
        status: true,
        service: { select: { price: true } },
      },
    });

    const buckets = new Map<string, { revenue: number; bookings: number; completed: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() - i * DAY_MS);
      const key = d.toISOString().split('T')[0];
      buckets.set(key, { revenue: 0, bookings: 0, completed: 0 });
    }
    for (const b of chartBookings) {
      const key = b.startTime.toISOString().split('T')[0];
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.bookings += 1;
      if (b.status === 'COMPLETED') {
        bucket.revenue += b.service?.price ?? 0;
        bucket.completed += 1;
      }
    }
    const chart = Array.from(buckets.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ──── assemble ────
    type CountAll = { _all?: number } | undefined | true;
    const roleMap = new Map(
      usersByRole.map((r) => {
        const count = r._count as CountAll;
        const value = typeof count === 'object' && count !== null ? count._all ?? 0 : 0;
        return [r.role, value] as const;
      }),
    );
    const statusMap = new Map(
      bookingsByStatus.map((r) => {
        const count = r._count as CountAll;
        const value = typeof count === 'object' && count !== null ? count._all ?? 0 : 0;
        return [r.status, value] as const;
      }),
    );

    const totalUsers = Array.from(roleMap.values()).reduce((a, b) => a + b, 0);
    const totalBookings = Array.from(statusMap.values()).reduce((a, b) => a + b, 0);

    const revenue7 = Number(revenue7Raw?.total ?? 0);
    const revenuePrev7 = Number(revenuePrev7Raw?.total ?? 0);
    const completedTodayRevenue = completedToday.reduce(
      (acc, b) => acc + (b.service?.price ?? 0),
      0,
    );

    const response = {
      generatedAt: now.toISOString(),
      periodDays: days,

      overview: {
        users: {
          total: totalUsers,
          customers: roleMap.get('CUSTOMER') ?? 0,
          owners: roleMap.get('OWNER') ?? 0,
          admins: roleMap.get('ADMIN') ?? 0,
          banned: usersBannedCount,
        },
        businesses: {
          total: businessesTotal,
        },
        bookings: {
          total: totalBookings,
          pending: statusMap.get('PENDING') ?? 0,
          confirmed: statusMap.get('CONFIRMED') ?? 0,
          completed: statusMap.get('COMPLETED') ?? 0,
          cancelled: statusMap.get('CANCELLED') ?? 0,
          noShow: statusMap.get('NO_SHOW') ?? 0,
        },
        reviews: {
          total: reviewsAgg._count._all,
          averageRating: reviewsAgg._avg.rating
            ? Math.round(reviewsAgg._avg.rating * 10) / 10
            : 0,
        },
        views: {
          total: viewsAgg._sum.viewsCount ?? 0,
        },
      },

      today: {
        newUsers: newUsersToday,
        newBookings: newBookingsToday,
        completedBookings: completedToday.length,
        revenue: completedTodayRevenue,
      },

      growth7d: {
        users: {
          current: newUsers7,
          previous: newUsersPrev7,
          percentChange: percentChange(newUsers7, newUsersPrev7),
        },
        bookings: {
          current: newBookings7,
          previous: newBookingsPrev7,
          percentChange: percentChange(newBookings7, newBookingsPrev7),
        },
        revenue: {
          current: revenue7,
          previous: revenuePrev7,
          percentChange: percentChange(revenue7, revenuePrev7),
        },
      },

      chart,

      topBusinesses: {
        byBookings: topBusinessesByBookings,
        byRevenue: topByRevenue.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          revenue: Number(b.revenue),
        })),
      },

      recentActivity: {
        bookings: recentBookings,
        users: recentUsers,
        adminLogs: recentAdminLogs,
      },
    };

    await this.cache.set(cacheKey, response, AdminDashboardService.CACHE_TTL_MS);
    return response;
  }
}
