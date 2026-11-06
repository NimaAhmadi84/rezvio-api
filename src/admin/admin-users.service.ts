import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActivityLogger } from './admin-activity-logger.service';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

/**
 * SELECT ایمن کاربر — بدون password
 */
const SAFE_ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  nationalId: true,
  role: true,
  isBanned: true,
  bannedAt: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminCtx {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: AdminActivityLogger,
  ) {}

  /**
   * لیست کاربران با فیلتر و pagination
   */
  async findAll(dto: QueryAdminUsersDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    if (dto.role) where.role = dto.role;
    if (dto.isBanned !== undefined) where.isBanned = dto.isBanned === 'true';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          ...SAFE_ADMIN_USER_SELECT,
          _count: {
            select: {
              ownedBusinesses: true,
              bookings: true,
              reviews: true,
              sessions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
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

  /**
   * جزئیات کامل کاربر (برای صفحه نمایش ادمین)
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_ADMIN_USER_SELECT,
        adminProfile: {
          select: {
            id: true,
            isActive: true,
            createdAt: true,
            role: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            ownedBusinesses: true,
            bookings: true,
            reviews: true,
            sessions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    return user;
  }

  /**
   * تغییر نقش کاربر
   *
   * قوانین:
   * - ادمین نمی‌تواند نقش خودش را تغییر دهد
   * - اگر از ADMIN به نقش دیگر تغییر کند → Admin profile غیرفعال می‌شه
   */
  async changeRole(
    targetUserId: string,
    dto: UpdateUserRoleDto,
    adminUserId: string,
    ctx: AdminCtx,
  ) {
    if (targetUserId === adminUserId) {
      throw new BadRequestException(
        'شما نمی‌توانید نقش خودتان را تغییر دهید',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (user.role === dto.role) {
      throw new BadRequestException('نقش کاربر در حال حاضر همین است');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { role: dto.role },
        select: SAFE_ADMIN_USER_SELECT,
      });

      // اگر از ADMIN به نقش دیگر رفت → Admin profile غیرفعال
      if (user.role === UserRole.ADMIN && dto.role !== UserRole.ADMIN) {
        await tx.admin.updateMany({
          where: { userId: targetUserId },
          data: { isActive: false },
        });
      }

      return u;
    });

    await this.activityLogger.log({
      adminId: adminUserId,
      action: 'user.change-role',
      targetType: 'User',
      targetId: targetUserId,
      metadata: { from: user.role, to: dto.role },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `User ${targetUserId} role changed: ${user.role} → ${dto.role} by admin ${adminUserId}`,
    );

    return updated;
  }

  /**
   * مسدود کردن کاربر
   *
   * قوانین:
   * - ادمین نمی‌تواند خودش را مسدود کند
   * - ادمین نمی‌تواند ادمین دیگری را مسدود کند (باید اول نقش را تغییر دهد)
   * - پس از مسدود، همه‌ی سشن‌های فعال غیرفعال می‌شن
   */
  async banUser(
    targetUserId: string,
    reason: string,
    adminUserId: string,
    ctx: AdminCtx,
  ) {
    if (targetUserId === adminUserId) {
      throw new BadRequestException('شما نمی‌توانید خودتان را مسدود کنید');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isBanned: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'نمی‌توانید یک ادمین را مسدود کنید. ابتدا نقش او را تغییر دهید.',
      );
    }

    if (user.isBanned) {
      throw new BadRequestException('این کاربر از قبل مسدود است');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          banReason: reason,
        },
      });

      // غیرفعال کردن همه‌ی سشن‌های فعال
      await tx.userSession.updateMany({
        where: { userId: targetUserId, isActive: true },
        data: { isActive: false },
      });
    });

    await this.activityLogger.log({
      adminId: adminUserId,
      action: 'user.ban',
      targetType: 'User',
      targetId: targetUserId,
      metadata: { reason },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.warn(
      `User ${targetUserId} banned by admin ${adminUserId} — reason: ${reason}`,
    );

    return { success: true, message: 'کاربر با موفقیت مسدود شد' };
  }

  /**
   * خارج کردن کاربر از مسدودی
   */
  async unbanUser(
    targetUserId: string,
    adminUserId: string,
    ctx: AdminCtx,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isBanned: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (!user.isBanned) {
      throw new BadRequestException('این کاربر از قبل مسدود نیست');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isBanned: false, bannedAt: null, banReason: null },
    });

    await this.activityLogger.log({
      adminId: adminUserId,
      action: 'user.unban',
      targetType: 'User',
      targetId: targetUserId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(`User ${targetUserId} unbanned by admin ${adminUserId}`);

    return { success: true, message: 'کاربر از مسدودی خارج شد' };
  }
}
