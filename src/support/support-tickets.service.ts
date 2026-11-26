import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';

// ═══════════════════════════════════════════════════════════════
// 🎯 Public Field Selections (hide internal/sensitive fields)
// ═══════════════════════════════════════════════════════════════

/**
 * فیلدهای نمایشی تیکت برای کاربر — بدون assignedAdminId/relatedType/relatedId
 * (این‌ها فقط برای ادمین قابل مشاهده است)
 */
const TICKET_PUBLIC_SELECT = {
  id: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
} as const;

/**
 * فیلدهای پیام برای کاربر — بدون isInternal و senderId
 * (کاربر نیازی ندارد بداند کدام پیام internal است یا شناسه فرستنده را ببیند)
 */
const MESSAGE_PUBLIC_SELECT = {
  id: true,
  senderType: true,
  senderName: true,
  text: true,
  createdAt: true,
} as const;

/**
 * ساخت meta استاندارد pagination (هم‌خوان با سایر ماژول‌ها)
 */
function buildPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🎫 SupportTicketsService — Customer-facing
// ═══════════════════════════════════════════════════════════════

@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * ایجاد تیکت جدید + پیام اولیه
   * (atomic via Prisma nested create)
   */
  async create(userId: string, dto: CreateTicketDto) {
    // 1. نام کاربر برای snapshot در پیام
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    const senderName = user.name || 'کاربر';

    // 2. Create ticket + initial message (nested, atomic)
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        category: dto.category ?? 'GENERAL',
        priority: dto.priority ?? 'NORMAL',
        status: 'OPEN',
        messages: {
          create: {
            senderId: userId,
            senderType: 'USER',
            senderName,
            text: dto.initialMessage,
            isInternal: false,
          },
        },
      },
      select: {
        ...TICKET_PUBLIC_SELECT,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: MESSAGE_PUBLIC_SELECT,
        },
      },
    });

    this.logger.log(`Ticket ${ticket.id} created by user ${userId}`);
    return ticket;
  }

  /**
   * لیست تیکت‌های خود کاربر (با فیلتر status + pagination)
   */
  async findMine(userId: string, dto: QueryTicketsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SupportTicketWhereInput = { userId };
    if (dto.status) where.status = dto.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        select: TICKET_PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * جزئیات تیکت خود کاربر + همه پیام‌های public
   * (internal notes filter می‌شوند)
   */
  async findOne(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId }, // ← ownership inline
      select: {
        ...TICKET_PUBLIC_SELECT,
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          select: MESSAGE_PUBLIC_SELECT,
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }
    return ticket;
  }

  /**
   * پاسخ کاربر به تیکت
   * - CLOSED → 400 (باید تیکت جدید بسازد)
   * - RESOLVED → auto reopen به OPEN (و reset resolvedAt)
   * - isInternal=true از سمت کاربر → 400
   */
  async reply(userId: string, ticketId: string, dto: ReplyTicketDto) {
    // 1. Fetch ticket + ownership
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }

    // 2. Block internal note from users
    if (dto.isInternal) {
      throw new BadRequestException(
        'یادداشت داخلی فقط توسط تیم پشتیبانی قابل ثبت است',
      );
    }

    // 3. Block reply on CLOSED
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException(
        'این تیکت بسته شده است. لطفاً یک تیکت جدید ایجاد کنید.',
      );
    }

    // 4. Sender display name
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const senderName = user?.name || 'کاربر';

    // 5. Auto-reopen: RESOLVED → OPEN
    const statusChanged = ticket.status === 'RESOLVED';
    const newStatus: TicketStatus = statusChanged ? 'OPEN' : ticket.status;

    // 6. Atomic: update status (if needed) + create message
    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      if (statusChanged) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: { status: newStatus, resolvedAt: null },
        });
      }

      await tx.ticketMessage.create({
        data: {
          ticketId,
          senderId: userId,
          senderType: 'USER',
          senderName,
          text: dto.text,
          isInternal: false,
        },
      });

      // Return full updated ticket
      return tx.supportTicket.findUniqueOrThrow({
        where: { id: ticketId },
        select: {
          ...TICKET_PUBLIC_SELECT,
          messages: {
            where: { isInternal: false },
            orderBy: { createdAt: 'asc' },
            select: MESSAGE_PUBLIC_SELECT,
          },
        },
      });
    });

    // ──── Phase 28A: Notify assigned admin (if any) ────
    const ticketFull = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { assignedAdminId: true, subject: true, user: { select: { name: true } } },
    });
    
    if (ticketFull?.assignedAdminId) {
      const admin = await this.prisma.admin.findUnique({
        where: { id: ticketFull.assignedAdminId },
        select: { userId: true },
      });
      if (admin) {
        this.notificationsService.create(
          admin.userId,
          NotificationType.TICKET_REPLY,
          'پاسخ جدید به تیکت',
          `${ticketFull.user?.name || 'کاربر'} به تیکت «${ticketFull.subject}» پاسخ داد.`,
          { ticketId },
        ).catch(() => {}); // Fail-safe
      }
    }

    return updatedTicket;
  }

  /**
   * بستن تیکت توسط کاربر (idempotent)
   */
  async close(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }

    // Idempotent: already closed → return as-is
    if (ticket.status === 'CLOSED') {
      return this.findOne(userId, ticketId);
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    this.logger.log(`Ticket ${ticketId} closed by user ${userId}`);
    return this.findOne(userId, ticketId);
  }
}