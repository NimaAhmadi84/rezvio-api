import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActivityLogger } from '../admin/admin-activity-logger.service';
import { QueryAdminTicketsDto } from './dto/query-admin-tickets.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

// ═══════════════════════════════════════════════════════════════
// 🎯 Types & Constants
// ═══════════════════════════════════════════════════════════════

export interface AdminCtx {
  ip?: string;
  userAgent?: string;
}

/**
 * نام نمایشی ادمین در پیام‌ها — ثابت برای حفظ حریم خصوصی
 * (نام واقعی ادمین فقط در audit log ثبت می‌شود)
 */
const ADMIN_SENDER_NAME = 'تیم پشتیبانی';

/**
 * جدول transitionهای مجاز (که در service اعتبارسنجی می‌شود)
 */
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
  CLOSED: ['OPEN'], // reopen only
};

function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * ساخت meta استاندارد pagination
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
// 🛡️ AdminSupportService — Admin-facing
// ═══════════════════════════════════════════════════════════════

@Injectable()
export class AdminSupportService {
  private readonly logger = new Logger(AdminSupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: AdminActivityLogger,
  ) {}

  // ──── Read ────

  /**
   * لیست همه تیکت‌ها (cross-user) با فیلتر پیشرفته + pagination
   */
  async findAll(dto: QueryAdminTicketsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SupportTicketWhereInput = {};

    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (dto.status) where.status = dto.status;
    if (dto.priority) where.priority = dto.priority;
    if (dto.category) where.category = dto.category;
    if (dto.assignedAdminId) where.assignedAdminId = dto.assignedAdminId;
    if (dto.userId) where.userId = dto.userId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        select: {
          id: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          assignedAdminId: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          closedAt: true,
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          _count: { select: { messages: true } },
        },
        orderBy: [
          { status: 'asc' }, // OPEN first, CLOSED last
          { priority: 'desc' }, // HIGH first
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * جزئیات کامل تیکت (همه پیام‌ها — شامل internal)
   */
  async findOne(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        assignedAdminId: true,
        relatedType: true,
        relatedId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        closedAt: true,
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderId: true,
            senderType: true,
            senderName: true,
            text: true,
            isInternal: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }
    return ticket;
  }

  // ──── Mutations (all audited) ────

  /**
   * پاسخ ادمین به تیکت
   * - OPEN → auto IN_PROGRESS
   * - RESOLVED/CLOSED → 400 (ابتدا وضعیت را تغییر دهید)
   */
  async reply(
    adminUserId: string,
    ticketId: string,
    dto: ReplyTicketDto,
    ctx: AdminCtx,
  ) {
    const admin = await this.getAdminProfile(adminUserId);

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      throw new BadRequestException(
        `تیکت در وضعیت ${ticket.status} است. ابتدا وضعیت را تغییر دهید و سپس پاسخ دهید.`,
      );
    }

    const statusChanged = ticket.status === 'OPEN';
    const newStatus: TicketStatus = statusChanged ? 'IN_PROGRESS' : ticket.status;

    const message = await this.prisma.$transaction(async (tx) => {
      if (statusChanged) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: { status: newStatus },
        });
      }

      return tx.ticketMessage.create({
        data: {
          ticketId,
          senderId: admin.userId, // User.id of admin
          senderType: 'ADMIN',
          senderName: ADMIN_SENDER_NAME,
          text: dto.text,
          isInternal: dto.isInternal ?? false,
        },
        select: {
          id: true,
          senderType: true,
          senderName: true,
          text: true,
          isInternal: true,
          createdAt: true,
        },
      });
    });

    // Audit (fail-safe — never throws)
    await this.activityLogger.log({
      adminId: admin.id, // ← Admin.id, NOT user.id
      action: 'ticket.reply',
      targetType: 'SupportTicket',
      targetId: ticketId,
      metadata: {
        isInternal: dto.isInternal ?? false,
        statusChanged: statusChanged ? { from: ticket.status, to: newStatus } : null,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `Admin ${admin.id} replied to ticket ${ticketId}${dto.isInternal ? ' (internal)' : ''}`,
    );
    return message;
  }

  /**
   * تغییر وضعیت تیکت با اعتبارسنجی transition
   */
  async changeStatus(
    adminUserId: string,
    ticketId: string,
    dto: UpdateTicketStatusDto,
    ctx: AdminCtx,
  ) {
    const admin = await this.getAdminProfile(adminUserId);

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }

    // No-op if same status
    if (ticket.status === dto.status) {
      return this.findOne(ticketId);
    }

    if (!canTransition(ticket.status, dto.status)) {
      throw new BadRequestException(
        `تغییر وضعیت از ${ticket.status} به ${dto.status} مجاز نیست`,
      );
    }

    const updateData: Prisma.SupportTicketUpdateInput = { status: dto.status };
    if (dto.status === 'RESOLVED') updateData.resolvedAt = new Date();
    if (dto.status === 'CLOSED') updateData.closedAt = new Date();
    if (dto.status === 'OPEN') {
      updateData.resolvedAt = null;
      updateData.closedAt = null;
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    await this.activityLogger.log({
      adminId: admin.id,
      action: 'ticket.change-status',
      targetType: 'SupportTicket',
      targetId: ticketId,
      metadata: { from: ticket.status, to: dto.status },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `Admin ${admin.id} changed ticket ${ticketId} status: ${ticket.status} → ${dto.status}`,
    );
    return this.findOne(ticketId);
  }

  /**
   * تخصیص تیکت به یک ادمین (یا unassign با null)
   * فقط Super Admin (ticket:assign) — کنترل در PermissionGuard
   */
  async assign(
    adminUserId: string,
    ticketId: string,
    targetAdminId: string | null,
    ctx: AdminCtx,
  ) {
    const admin = await this.getAdminProfile(adminUserId);

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, assignedAdminId: true },
    });
    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }

    let targetAdminName: string | null = null;
    if (targetAdminId) {
      const targetAdmin = await this.prisma.admin.findUnique({
        where: { id: targetAdminId },
        select: {
          id: true,
          isActive: true,
          user: { select: { name: true, email: true } },
        },
      });
      if (!targetAdmin) {
        throw new NotFoundException('ادمین هدف یافت نشد');
      }
      if (!targetAdmin.isActive) {
        throw new BadRequestException('ادمین هدف غیرفعال است');
      }
      targetAdminName = targetAdmin.user.name || targetAdmin.user.email || null;
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedAdminId: targetAdminId },
    });

    await this.activityLogger.log({
      adminId: admin.id,
      action: 'ticket.assign',
      targetType: 'SupportTicket',
      targetId: ticketId,
      metadata: {
        from: ticket.assignedAdminId,
        to: targetAdminId,
        toAdminName: targetAdminName,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `Admin ${admin.id} assigned ticket ${ticketId} → ${targetAdminId ?? 'unassigned'}`,
    );
    return this.findOne(ticketId);
  }

  // ──── Private helpers ────

  /**
   * پروفایل ادمین را بر اساس User.id برمی‌گرداند
   * (adminId در audit = Admin.id، متفاوت از User.id)
   */
  private async getAdminProfile(adminUserId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { userId: adminUserId },
      select: {
        id: true,
        userId: true,
        isActive: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!admin) {
      throw new ForbiddenException('پروفایل ادمین یافت نشد');
    }
    if (!admin.isActive) {
      throw new ForbiddenException('حساب ادمین غیرفعال است');
    }
    return {
      id: admin.id,
      userId: admin.userId,
    };
  }
}