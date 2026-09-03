import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException, Logger
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
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
  [BookingStatus.COMPLETED]: [], // وضعیت نهایی
  [BookingStatus.CANCELLED]: [], // وضعیت نهایی
  [BookingStatus.NO_SHOW]: [],   // وضعیت نهایی
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
    private readonly availabilityService: AvailabilityService,
  ) { }

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
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

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
    // این مهم‌ترین بخش است!
    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          // داخل transaction دوباره چک می‌کنیم که overlap نباشد
          // این کار از race condition جلوگیری می‌کند
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

          // ایجاد رزرو
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
          // timeout برای transaction: 10 ثانیه
          timeout: 10000,
        },
      );

      // برگرداندن رزرو با جزئیات کامل
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
   * دریافت رزروهای یک business (فقط OWNER)
   */
  async findBusinessBookings(businessId: string, userId: string) {
    // بررسی مالکیت business
    await this.businessesService.checkOwnership(businessId, userId);

    return this.prisma.booking.findMany({
      where: { businessId },
      include: {
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
      orderBy: { startTime: 'desc' },
    });
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
  async updateStatus(id: string, userId: string, userRole: string, dto: UpdateBookingStatusDto) {
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

    // بررسی دسترسی:
    // CUSTOMER فقط می‌تواند رزروهای خودش را CANCEL کند
    // OWNER می‌تواند رزروهای business خودش را مدیریت کند
    // ADMIN به همه دسترسی دارد
    const isCustomer = userRole === 'CUSTOMER';
    const isOwner = userRole === 'OWNER';
    const isAdmin = userRole === 'ADMIN';

    if (isCustomer) {
      // CUSTOMER فقط مالک رزرو خودش است
      if (booking.customerId !== userId) {
        throw new ForbiddenException('شما مالک این رزرو نیستید');
      }
      // CUSTOMER فقط می‌تواند CANCEL کند
      if (dto.status !== BookingStatus.CANCELLED) {
        throw new ForbiddenException('شما فقط می‌توانید رزرو خود را لغو کنید');
      }
    } else if (isOwner) {
      // OWNER باید مالک business باشد
      if (booking.business.ownerId !== userId) {
        throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
      }
    } else if (!isAdmin) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    // بررسی قوانین تغییر وضعیت
    const allowedTransitions = STATUS_TRANSITIONS[booking.status];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `تغییر وضعیت از ${booking.status} به ${dto.status} مجاز نیست`,
      );
    }

    // 🎯 محاسبه تغییر bookingsCount برای کسب‌وکار
    // PENDING → CONFIRMED: +1 (رزرو تأیید شد)
    // CONFIRMED → CANCELLED: -1 (رزرو لغو شد، rollback)
    let bookingsCountDelta = 0;
    const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
    const willBeConfirmed = dto.status === BookingStatus.CONFIRMED;
    const willBeCancelled = dto.status === BookingStatus.CANCELLED;

    if (!wasConfirmed && willBeConfirmed) {
      bookingsCountDelta = 1;
      this.logger.log(`📈 Incrementing bookingsCount for business ${booking.businessId} (PENDING → CONFIRMED)`);
    } else if (wasConfirmed && willBeCancelled) {
      bookingsCountDelta = -1;
      this.logger.log(`📉 Decrementing bookingsCount for business ${booking.businessId} (CONFIRMED → CANCELLED)`);
    }

    // 🔄 اجرای atomic transaction: update booking + update business.bookingsCount
    return this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: { status: dto.status },
      });

      // فقط اگر delta غیر صفر باشد، business را update می‌کنیم
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
   * این متد فقط status را به CANCELLED تغییر می‌دهد
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

    // بررسی دسترسی
    const isCustomer = userRole === 'CUSTOMER';
    const isOwner = userRole === 'OWNER';
    const isAdmin = userRole === 'ADMIN';

    if (isCustomer) {
      if (booking.customerId !== userId) {
        throw new ForbiddenException('شما مالک این رزرو نیستید');
      }
      // CUSTOMER فقط می‌تواند رزروهای PENDING را لغو کند
      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException('فقط رزروهای در انتظار تأیید قابل لغو هستند');
      }
    } else if (isOwner) {
      if (booking.business.ownerId !== userId) {
        throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
      }
      // OWNER نمی‌تواند رزروهای COMPLETED را لغو کند
      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException('رزروهای تکمیل شده قابل لغو نیستند');
      }
    } else if (!isAdmin) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    // 🎯 اگر رزرو قبلاً CONFIRMED بوده، باید bookingsCount را کاهش دهیم
    const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
    const bookingsCountDelta = wasConfirmed ? -1 : 0;

    if (wasConfirmed) {
      this.logger.log(`📉 Decrementing bookingsCount for business ${booking.businessId} (CANCEL of CONFIRMED booking)`);
    }

    // 🔄 اجرای atomic transaction
    return this.prisma.$transaction(async (tx) => {
      const cancelledBooking = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED },
      });

      // فقط اگر رزرو قبلاً CONFIRMED بوده، business را update می‌کنیم
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
 * 
 * حل N+1 Problem: همه رزروهای آینده owner از همه کسب‌وکارهاش رو
 * در یک query می‌گیره (نه N query جدا).
 * 
 * @param userId - ID کاربر authenticated
 * @param days - تعداد روز آینده (پیش‌فرض 7)
 * @returns لیست رزروهای آینده با جزئیات کامل
 */
  async getUpcomingForOwner(userId: string, days = 7) {
    // ──── Step 1: همه کسب‌وکارهای owner رو بگیر ────
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (businesses.length === 0) {
      return [];
    }

    const businessIds = businesses.map((b) => b.id);

    // ──── Step 2: محاسبه محدوده زمانی ────
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // ──── Step 3: همه رزروهای آینده owner رو در یک query بگیر ────
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
