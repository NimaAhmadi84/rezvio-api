import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { BusinessesService } from '../businesses/businesses.service';
import { AvailabilityService } from '../availability/availability.service';
import { BookingStatus } from '@prisma/client';

/**
 * قوانین تغییر وضعیت رزرو
 * کدام وضعیت‌ها می‌توانند به کدام وضعیت‌ها تغییر کنند
 */
const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.NO_SHOW]: [],
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * ساخت رزرو جدید با جلوگیری از double-booking
   * این متد از transaction استفاده می‌کند تا race condition رو مدیریت کنه
   */
  async create(userId: string, dto: CreateBookingDto) {
    // 1. اعتبارسنجی business وجود داره
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    // 2. اعتبارسنجی service متعلق به این business است
    const service = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        businessId: dto.businessId,
      },
    });

    if (!service) {
      throw new NotFoundException('خدمت یافت نشد یا متعلق به این کسب‌وکار نیست');
    }

    // 3. اعتبارسنجی staff متعلق به این business است
    const staff = await this.prisma.staff.findFirst({
      where: {
        id: dto.staffId,
        businessId: dto.businessId,
      },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد یا متعلق به این کسب‌وکار نیست');
    }

    // 4. چک کردن رابطه M2M بین staff و service
    const staffService = await this.prisma.staffService.findUnique({
      where: {
        staffId_serviceId: {
          staffId: dto.staffId,
          serviceId: dto.serviceId,
        },
      },
    });

    if (!staffService) {
      throw new BadRequestException('این کارمند این خدمت را ارائه نمی‌دهد');
    }

    // 5. اعتبارسنجی تاریخ و زمان
    const startTime = new Date(dto.startTime);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('تاریخ و ساعت نامعتبر است');
    }

    // چک کنیم در گذشته نباشد
    const now = new Date();
    if (startTime <= now) {
      throw new BadRequestException('زمان رزرو نمی‌تواند در گذشته باشد');
    }

    // محاسبه endTime بر اساس duration خدمت
    const endTime = new Date(
      startTime.getTime() + service.durationMinutes * 60 * 1000,
    );

    // 6. چک کردن ساعات کاری برای آن روز
    const bookingDate = new Date(startTime);
    bookingDate.setHours(0, 0, 0, 0);

    const jsDayOfWeek = startTime.getDay();
    const iranDayOfWeek = (jsDayOfWeek + 1) % 7;

    const businessHour = await this.prisma.businessHour.findFirst({
      where: {
        businessId: dto.businessId,
        dayOfWeek: iranDayOfWeek,
      },
    });

    if (!businessHour) {
      throw new BadRequestException('این کسب‌وکار در این روز تعطیل است');
    }

    // چک کنیم ساعت رزرو در محدوده ساعات کاری باشد
    const slotStartMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const slotEndMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    const openMinutes = this.timeToMinutes(businessHour.openTime);
    const closeMinutes = this.timeToMinutes(businessHour.closeTime);

    if (slotStartMinutes < openMinutes || slotEndMinutes > closeMinutes) {
      throw new BadRequestException(
        `ساعت رزرو باید بین ${businessHour.openTime} تا ${businessHour.closeTime} باشد`,
      );
    }

    // 7. چک کردن تعطیلات
    const startOfDay = new Date(startTime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startTime);
    endOfDay.setHours(23, 59, 59, 999);

    const holiday = await this.prisma.holiday.findFirst({
      where: {
        businessId: dto.businessId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (holiday) {
      throw new BadRequestException('این تاریخ تعطیل رسمی کسب‌وکار است');
    }

    // 8. ایجاد رزرو در transaction برای جلوگیری از race condition
    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          const overlappingBooking = await tx.booking.findFirst({
            where: {
              businessId: dto.businessId,
              staffId: dto.staffId,
              status: {
                not: BookingStatus.CANCELLED,
              },
              startTime: {
                lt: endTime,
              },
              endTime: {
                gt: startTime,
              },
            },
          });

          if (overlappingBooking) {
            throw new ConflictException(
              'این زمان قبلاً رزرو شده است. لطفاً زمان دیگری را انتخاب کنید',
            );
          }

          return tx.booking.create({
            data: {
              businessId: dto.businessId,
              customerId: userId,
              staffId: dto.staffId,
              serviceId: dto.serviceId,
              startTime,
              endTime,
              notes: dto.notes,
              status: BookingStatus.PENDING,
            },
          });
        },
        {
          timeout: 10000,
        },
      );

      return this.findOne(booking.id);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException('خطا در ایجاد رزرو');
    }
  }

  /**
   * دریافت رزروهای خود کاربر (CUSTOMER)
   */
  async findMyBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { customerId: userId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  /**
   * دریافت رزروهای کسب‌وکار با فیلتر + pagination + stats
   *
   * 🎯 منطق کسب‌وکار:
   * - بازه زمانی حداکثر ۳۱ روز (برای جلوگیری از فشار سرور)
   * - stats روی کل بازه محاسبه می‌شه (مستقل از صفحه فعلی)
   * - درآمد = فقط COMPLETED (قانون ثبت‌شده کسب‌وکار)
   * - search سمت سرور با ILIKE (case-insensitive) برای عملکرد بهتر
   */
  async findBusinessBookings(
    businessId: string,
    userId: string,
    query?: QueryBookingsDto,
  ) {
    // ──── Step 1: بررسی مالکیت ────
    await this.businessesService.checkOwnership(businessId, userId);

    // ──── Step 2: محاسبه بازه زمانی (default: ۳۰ روز گذشته) ────
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = query?.from ? new Date(query.from) : defaultFrom;
    const to = query?.to ? new Date(query.to) : now;

    // to رو تا پایان روز ببریم (23:59:59)
    to.setHours(23, 59, 59, 999);

    // اعتبارسنجی بازه حداکثر ۳۱ روز
    const dayDiff = Math.ceil(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (dayDiff > 31) {
      throw new BadRequestException(
        'بازه زمانی نمی‌تواند بیش از ۳۱ روز باشد (برای حفاظت از سرور)',
      );
    }
    if (dayDiff < 0) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }

    // ──── Step 3: محاسبه stats روی کل بازه (مستقل از pagination) ────
    const statsWhere = {
      businessId,
      startTime: { gte: from, lte: to },
    };

    const [
      pendingCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      noShowCount,
      revenueResult,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: { ...statsWhere, status: BookingStatus.PENDING },
      }),
      this.prisma.booking.count({
        where: { ...statsWhere, status: BookingStatus.CONFIRMED },
      }),
      this.prisma.booking.count({
        where: { ...statsWhere, status: BookingStatus.COMPLETED },
      }),
      this.prisma.booking.count({
        where: { ...statsWhere, status: BookingStatus.CANCELLED },
      }),
      this.prisma.booking.count({
        where: { ...statsWhere, status: BookingStatus.NO_SHOW },
      }),
      // 🎯 درآمد: فقط COMPLETED در بازه — raw SQL برای join با service
      this.prisma.$queryRaw<[{ total: number | null }]>`
        SELECT COALESCE(SUM(s.price), 0) as total
        FROM bookings b
        JOIN services s ON b."serviceId" = s.id
        WHERE b."businessId" = ${businessId}
          AND b.status = 'COMPLETED'
          AND b."startTime" >= ${from}
          AND b."startTime" <= ${to}
      `,
    ]);

    const stats = {
      pending: pendingCount,
      confirmed: confirmedCount,
      completed: completedCount,
      cancelled: cancelledCount,
      noShow: noShowCount,
      totalRevenue: Number(revenueResult[0]?.total || 0),
    };

    // ──── Step 4: ساخت where clause برای لیست (با فیلترها) ────
    const listWhere: any = {
      businessId,
      startTime: { gte: from, lte: to },
    };

    // فیلتر وضعیت (ALL یعنی همه)
    const validStatuses = [
      'PENDING',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    if (query?.status && validStatuses.includes(query.status)) {
      listWhere.status = query.status;
    }

    // جستجو در customer/service/staff/phone
    if (query?.q && query.q.trim()) {
      const q = query.q.trim();
      listWhere.OR = [
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
        { staff: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // ──── Step 5: Pagination ────
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const skip = (page - 1) * limit;

    const total = await this.prisma.booking.count({ where: listWhere });

    // ──── Step 6: Query با include و sort ────
    const items = await this.prisma.booking.findMany({
      where: listWhere,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
      skip,
      take: limit,
    });

    // ──── Step 7: ساخت meta ────
    const totalPages = Math.ceil(total / limit) || 1;
    const meta = {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    this.logger.debug(
      `📋 Business ${businessId} bookings: ${items.length}/${total} (page ${page}/${totalPages}) in ${dayDiff}-day range`,
    );

    return { items, meta, stats };
  }

  /**
   * دریافت یک رزرو با ID
   */
  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('رزرو یافت نشد');
    }

    return booking;
  }

  /**
   * تغییر وضعیت رزرو
   */
  async updateStatus(
    id: string,
    userId: string,
    userRole: string,
    dto: UpdateBookingStatusDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('رزرو یافت نشد');
    }

    const isCustomer = userRole === 'CUSTOMER';
    const isOwner = userRole === 'OWNER';
    const isAdmin = userRole === 'ADMIN';

    if (isCustomer) {
      if (booking.customerId !== userId) {
        throw new ForbiddenException('شما مالک این رزرو نیستید');
      }
      if (dto.status !== BookingStatus.CANCELLED) {
        throw new ForbiddenException('شما فقط می‌توانید رزرو خود را لغو کنید');
      }
    } else if (isOwner) {
      if (booking.business.ownerId !== userId) {
        throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
      }
    } else if (!isAdmin) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    const allowedTransitions = STATUS_TRANSITIONS[booking.status];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `تغییر وضعیت از ${booking.status} به ${dto.status} مجاز نیست`,
      );
    }

    let bookingsCountDelta = 0;
    const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
    const willBeConfirmed = dto.status === BookingStatus.CONFIRMED;
    const willBeCancelled = dto.status === BookingStatus.CANCELLED;

    if (!wasConfirmed && willBeConfirmed) {
      bookingsCountDelta = 1;
      this.logger.log(
        `📈 Incrementing bookingsCount for business ${booking.businessId} (PENDING → CONFIRMED)`,
      );
    } else if (wasConfirmed && willBeCancelled) {
      bookingsCountDelta = -1;
      this.logger.log(
        `📉 Decrementing bookingsCount for business ${booking.businessId} (CONFIRMED → CANCELLED)`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: { status: dto.status },
      });

      if (bookingsCountDelta !== 0) {
        await tx.business.update({
          where: { id: booking.businessId },
          data: {
            bookingsCount: {
              increment: bookingsCountDelta,
            },
          },
        });
      }

      return updatedBooking;
    });
  }

  /**
   * لغو رزرو (DELETE)
   */
  async cancel(id: string, userId: string, userRole: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('رزرو یافت نشد');
    }

    const isCustomer = userRole === 'CUSTOMER';
    const isOwner = userRole === 'OWNER';
    const isAdmin = userRole === 'ADMIN';

    if (isCustomer) {
      if (booking.customerId !== userId) {
        throw new ForbiddenException('شما مالک این رزرو نیستید');
      }
      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException(
          'فقط رزروهای در انتظار تأیید قابل لغو هستند',
        );
      }
    } else if (isOwner) {
      if (booking.business.ownerId !== userId) {
        throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
      }
      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException('رزروهای تکمیل شده قابل لغو نیستند');
      }
    } else if (!isAdmin) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
    const bookingsCountDelta = wasConfirmed ? -1 : 0;

    if (wasConfirmed) {
      this.logger.log(
        `📉 Decrementing bookingsCount for business ${booking.businessId} (CANCEL of CONFIRMED booking)`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelledBooking = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED },
      });

      if (bookingsCountDelta !== 0) {
        await tx.business.update({
          where: { id: booking.businessId },
          data: {
            bookingsCount: {
              increment: bookingsCountDelta,
            },
          },
        });
      }

      return cancelledBooking;
    });
  }

  /**
   * تبدیل string زمان (HH:MM) به دقیقه از شروع روز
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * دریافت رزروهای پیش‌رو (upcoming appointments) برای OWNER
   */
  async getUpcomingForOwner(userId: string, days = 7) {
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (businesses.length === 0) {
      return [];
    }

    const businessIds = businesses.map((b) => b.id);

    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        businessId: { in: businessIds },
        startTime: {
          gte: now,
          lt: future,
        },
        status: {
          notIn: ['CANCELLED', 'NO_SHOW'],
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    this.logger.debug(
      `📅 Upcoming bookings for user ${userId}: ${bookings.length} bookings in next ${days} days`,
    );

    return bookings;
  }
}