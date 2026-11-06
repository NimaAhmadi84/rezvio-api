import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { AdminActivityLogger } from './admin-activity-logger.service';
import { QueryAdminBookingsDto } from './dto/query-admin-bookings.dto';
import { UpdateBookingStatusDto } from '../bookings/dto/update-booking-status.dto';

interface AdminCtx {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AdminBookingsService {
  private readonly logger = new Logger(AdminBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly activityLogger: AdminActivityLogger,
  ) {}

  async findAll(dto: QueryAdminBookingsDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
        { staff: { name: { contains: q, mode: 'insensitive' } } },
        { business: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (dto.status) where.status = dto.status as BookingStatus;
    if (dto.businessId) where.businessId = dto.businessId;
    if (dto.customerId) where.customerId = dto.customerId;
    if (dto.staffId) where.staffId = dto.staffId;

    if (dto.from || dto.to) {
      where.startTime = {};
      if (dto.from) where.startTime.gte = new Date(dto.from);
      if (dto.to) where.startTime.lte = new Date(dto.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, slug: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          service: { select: { id: true, name: true, price: true, durationMinutes: true } },
          staff: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string, adminId: string) {
    return this.bookingsService.findOne(id, adminId, 'ADMIN');
  }

  async changeStatus(
    id: string,
    dto: UpdateBookingStatusDto,
    adminId: string,
    ctx: AdminCtx,
  ) {
    const oldBooking = await this.prisma.booking.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!oldBooking) {
      throw new NotFoundException('رزرو یافت نشد');
    }

    const result = await this.bookingsService.updateStatus(id, adminId, 'ADMIN', dto);

    await this.activityLogger.log({
      adminId,
      action: 'booking.change-status',
      targetType: 'Booking',
      targetId: id,
      metadata: { from: oldBooking.status, to: dto.status },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `Booking ${id} status: ${oldBooking.status} → ${dto.status} by admin ${adminId}`,
    );
    return result;
  }

  async cancelWithReason(
    id: string,
    reason: string,
    adminId: string,
    ctx: AdminCtx,
  ) {
    const oldBooking = await this.prisma.booking.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!oldBooking) {
      throw new NotFoundException('رزرو یافت نشد');
    }

    const result = await this.bookingsService.updateStatus(id, adminId, 'ADMIN', {
      status: BookingStatus.CANCELLED,
    } as UpdateBookingStatusDto);

    await this.activityLogger.log({
      adminId,
      action: 'booking.cancel',
      targetType: 'Booking',
      targetId: id,
      metadata: { from: oldBooking.status, reason },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.warn(`Booking ${id} cancelled by admin ${adminId} — reason: ${reason}`);
    return result;
  }
}
