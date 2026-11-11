import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActivityLogger } from './admin-activity-logger.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryAdminsDto } from './dto/query-admins.dto';
import { QueryActivityLogsDto } from './dto/query-activity-logs.dto';

const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
const ADMIN_PERM_CACHE_PREFIX = 'admin-perm:';

interface AdminCtx {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AdminManagementService {
  private readonly logger = new Logger(AdminManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: AdminActivityLogger,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // 🔑 Helpers
  // ═══════════════════════════════════════════════════════════

  private async getActingAdmin(adminUserId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { userId: adminUserId },
      include: { role: true },
    });
    if (!admin || !admin.isActive) {
      throw new ForbiddenException('حساب ادمین شما غیرفعال یا یافت نشد');
    }
    return admin;
  }

  private async invalidateCacheForUsers(userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.cache.del(`${ADMIN_PERM_CACHE_PREFIX}${userId}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 👥 Admins CRUD
  // ═══════════════════════════════════════════════════════════

  async listAdmins(dto: QueryAdminsDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.isActive !== undefined) where.isActive = dto.isActive === 'true';
    if (dto.roleId) where.roleId = dto.roleId;

    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.admin.findMany({
        where,
        include: {
          role: { select: { id: true, name: true, isSystem: true } },
          user: {
            select: {
              id: true, name: true, email: true, phone: true, isBanned: true,
            },
          },
          _count: { select: { activityLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.admin.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      items,
      meta: {
        total, page, limit, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getAdmin(id: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        user: {
          select: {
            id: true, name: true, email: true, phone: true,
            role: true, isBanned: true, createdAt: true,
          },
        },
        _count: { select: { activityLogs: true } },
      },
    });

    if (!admin) throw new NotFoundException('ادمین یافت نشد');

    return {
      ...admin,
      role: {
        id: admin.role.id,
        name: admin.role.name,
        description: admin.role.description,
        isSystem: admin.role.isSystem,
        permissions: admin.role.permissions.map((rp) => ({
          id: rp.permission.id,
          code: rp.permission.code,
          module: rp.permission.module,
          action: rp.permission.action,
          description: rp.permission.description,
        })),
      },
    };
  }

  async createAdmin(dto: CreateAdminDto, actingAdminId: string, ctx: AdminCtx) {
    const actingAdmin = await this.getActingAdmin(actingAdminId);

    const [user, targetRole] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        include: { adminProfile: true },
      }),
      this.prisma.adminRole.findUnique({ where: { id: dto.roleId } }),
    ]);

    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!targetRole) throw new NotFoundException('نقش یافت نشد');
    if (user.adminProfile) {
      throw new ConflictException('این کاربر از قبل پروفایل ادمین دارد');
    }

    // فقط Super Admin می‌تونه نقش Super Admin بده
    if (
      targetRole.name === SUPER_ADMIN_ROLE_NAME &&
      actingAdmin.role.name !== SUPER_ADMIN_ROLE_NAME
    ) {
      throw new ForbiddenException(
        'تنها Super Admin می‌تواند نقش Super Admin اختصاص دهد',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // ارتقای نقش کاربر به ADMIN
      await tx.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });

      return tx.admin.create({
        data: {
          userId: user.id,
          roleId: targetRole.id,
          isActive: true,
          createdBy: actingAdmin.id,
        },
        include: {
          role: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });

    await this.invalidateCacheForUsers([user.id]);

    await this.activityLogger.log({
      adminId: actingAdmin.id,
      action: 'admin.create',
      targetType: 'Admin',
      targetId: created.id,
      metadata: {
        userId: user.id,
        roleName: targetRole.name,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `Admin profile created for user ${user.id} with role "${targetRole.name}" by admin ${actingAdminId}`,
    );
    return created;
  }

  async updateAdmin(
    id: string,
    dto: UpdateAdminDto,
    actingAdminId: string,
    ctx: AdminCtx,
  ) {
    const actingAdmin = await this.getActingAdmin(actingAdminId);

    const target = await this.prisma.admin.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');

    // تغییر نقش
    if (dto.roleId && dto.roleId !== target.roleId) {
      const newRole = await this.prisma.adminRole.findUnique({
        where: { id: dto.roleId },
      });
      if (!newRole) throw new NotFoundException('نقش جدید یافت نشد');

      // فقط Super Admin می‌تونه نقش Super Admin بده
      if (
        newRole.name === SUPER_ADMIN_ROLE_NAME &&
        actingAdmin.role.name !== SUPER_ADMIN_ROLE_NAME
      ) {
        throw new ForbiddenException(
          'تنها Super Admin می‌تواند نقش Super Admin اختصاص دهد',
        );
      }

      // نمی‌تونه از نقش Super Admin خارج بشه مگر توسط Super Admin
      if (
        target.role.name === SUPER_ADMIN_ROLE_NAME &&
        actingAdmin.role.name !== SUPER_ADMIN_ROLE_NAME
      ) {
        throw new ForbiddenException(
          'تنها Super Admin می‌تواند نقش Super Admin را تغییر دهد',
        );
      }
    }

    // تغییر isActive
    if (dto.isActive === false && target.id === actingAdmin.id) {
      throw new BadRequestException('نمی‌توانید خودتان را غیرفعال کنید');
    }

    const updated = await this.prisma.admin.update({
      where: { id },
      data: {
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await this.invalidateCacheForUsers([target.userId]);

    await this.activityLogger.log({
      adminId: actingAdmin.id,
      action: 'admin.update',
      targetType: 'Admin',
      targetId: id,
      metadata: {
        fromRole: target.role.name,
        toRole: updated.role.name,
        fromActive: target.isActive,
        toActive: updated.isActive,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  async deactivateAdmin(id: string, actingAdminId: string, ctx: AdminCtx) {
    const actingAdmin = await this.getActingAdmin(actingAdminId);

    const target = await this.prisma.admin.findUnique({
      where: { id },
      include: { role: true, user: { select: { id: true, name: true } } },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    if (!target.isActive) {
      throw new BadRequestException('این ادمین از قبل غیرفعال است');
    }
    if (target.id === actingAdmin.id) {
      throw new BadRequestException('نمی‌توانید خودتان را غیرفعال کنید');
    }

    // نمی‌توان آخرین Super Admin را غیرفعال کرد
    if (target.role.name === SUPER_ADMIN_ROLE_NAME) {
      const activeSuperAdmins = await this.prisma.admin.count({
        where: {
          isActive: true,
          role: { name: SUPER_ADMIN_ROLE_NAME },
        },
      });
      if (activeSuperAdmins <= 1) {
        throw new BadRequestException(
          'نمی‌توان آخرین Super Admin فعال را غیرفعال کرد',
        );
      }
    }

    await this.prisma.admin.update({
      where: { id },
      data: { isActive: false },
    });

    await this.invalidateCacheForUsers([target.userId]);

    await this.activityLogger.log({
      adminId: actingAdmin.id,
      action: 'admin.deactivate',
      targetType: 'Admin',
      targetId: id,
      metadata: {
        userId: target.userId,
        roleName: target.role.name,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.warn(`Admin ${id} deactivated by ${actingAdminId}`);
    return { success: true, message: 'ادمین غیرفعال شد' };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎭 Roles CRUD
  // ═══════════════════════════════════════════════════════════

  async listRoles() {
    const roles = await this.prisma.adminRole.findMany({
      include: {
        _count: { select: { admins: true, permissions: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return { items: roles };
  }

  async getRole(id: string) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        admins: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('نقش یافت نشد');

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        module: rp.permission.module,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
      admins: role.admins.map((a) => ({
        id: a.id,
        isActive: a.isActive,
        userId: a.user.id,
        userName: a.user.name,
        userEmail: a.user.email,
      })),
    };
  }

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    // گروه‌بندی بر اساس module برای UI picker
    const grouped = permissions.reduce<Record<string, typeof permissions>>(
      (acc, p) => {
        if (!acc[p.module]) acc[p.module] = [];
        acc[p.module].push(p);
        return acc;
      },
      {},
    );

    return { items: permissions, groupedByModule: grouped };
  }

  async createRole(dto: CreateRoleDto, actingAdminId: string, ctx: AdminCtx) {
    const actingAdmin = await this.getActingAdmin(actingAdminId);

    const existing = await this.prisma.adminRole.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('نقشی با این نام وجود دارد');

    // اعتبارسنجی permissionCodes
    let permissionIds: string[] = [];
    if (dto.permissionCodes && dto.permissionCodes.length > 0) {
      const perms = await this.prisma.permission.findMany({
        where: { code: { in: dto.permissionCodes } },
        select: { id: true, code: true },
      });
      const foundCodes = new Set(perms.map((p) => p.code));
      const missing = dto.permissionCodes.filter((c) => !foundCodes.has(c));
      if (missing.length > 0) {
        throw new BadRequestException(
          `مجوزهای نامعتبر: ${missing.join(', ')}`,
        );
      }
      permissionIds = perms.map((p) => p.id);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.adminRole.create({
        data: {
          name: dto.name,
          description: dto.description,
          isSystem: false,
        },
      });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((pid) => ({
            roleId: role.id,
            permissionId: pid,
          })),
        });
      }
      return role;
    });

    await this.activityLogger.log({
      adminId: actingAdmin.id,
      action: 'role.create',
      targetType: 'AdminRole',
      targetId: created.id,
      metadata: {
        name: dto.name,
        permissionCount: permissionIds.length,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(
      `Role "${dto.name}" created by admin ${actingAdminId}`,
    );
    return created;
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actingAdminId: string,
    ctx: AdminCtx,
  ) {
    const actingAdmin = await this.getActingAdmin(actingAdminId);

    const target = await this.prisma.adminRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        admins: { select: { userId: true } },
      },
    });
    if (!target) throw new NotFoundException('نقش یافت نشد');

    // نقش سیستمی: فقط Super Admin می‌تونه ویرایش کنه
    if (
      target.isSystem &&
      actingAdmin.role.name !== SUPER_ADMIN_ROLE_NAME
    ) {
      throw new ForbiddenException(
        'ویرایش نقش‌های سیستمی فقط توسط Super Admin مجاز است',
      );
    }

    // یکتایی نام جدید
    if (dto.name && dto.name !== target.name) {
      const existing = await this.prisma.adminRole.findUnique({
        where: { name: dto.name },
      });
      if (existing) throw new ConflictException('نقشی با این نام وجود دارد');
    }

    // مجوزهای جدید
    let newPermissionIds: string[] | undefined;
    if (dto.permissionCodes !== undefined) {
      const perms = await this.prisma.permission.findMany({
        where: { code: { in: dto.permissionCodes } },
        select: { id: true, code: true },
      });
      const foundCodes = new Set(perms.map((p) => p.code));
      const missing = dto.permissionCodes.filter((c) => !foundCodes.has(c));
      if (missing.length > 0) {
        throw new BadRequestException(
          `مجوزهای نامعتبر: ${missing.join(', ')}`,
        );
      }
      newPermissionIds = perms.map((p) => p.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const role = await tx.adminRole.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
        },
      });

      if (newPermissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (newPermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: newPermissionIds.map((pid) => ({
              roleId: id,
              permissionId: pid,
            })),
          });
        }
      }
      return role;
    });

    // invalidation برای همه‌ی ادمین‌های این نقش (permissions یا نام عوض شده)
    await this.invalidateCacheForUsers(target.admins.map((a) => a.userId));

    await this.activityLogger.log({
      adminId: actingAdmin.id,
      action: 'role.update',
      targetType: 'AdminRole',
      targetId: id,
      metadata: {
        fromName: target.name,
        toName: updated.name,
        permissionsChanged: newPermissionIds !== undefined,
        permissionCount: newPermissionIds?.length,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  async deleteRole(id: string, actingAdminId: string, ctx: AdminCtx) {
    const actingAdmin = await this.getActingAdmin(actingAdminId);

    const target = await this.prisma.adminRole.findUnique({
      where: { id },
      include: { _count: { select: { admins: true } } },
    });
    if (!target) throw new NotFoundException('نقش یافت نشد');

    if (target.isSystem) {
      throw new BadRequestException(
        'نقش‌های سیستمی قابل حذف نیستند (فقط قابل ویرایش)',
      );
    }
    if (target._count.admins > 0) {
      throw new BadRequestException(
        `${target._count.admins} ادمین به این نقش متصل است. ابتدا نقش آن‌ها را تغییر دهید`,
      );
    }

    // Cascade خودش rolePermissions رو پاک می‌کنه
    await this.prisma.adminRole.delete({ where: { id } });

    await this.activityLogger.log({
      adminId: actingAdmin.id,
      action: 'role.delete',
      targetType: 'AdminRole',
      targetId: id,
      metadata: { name: target.name },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.warn(`Role "${target.name}" deleted by admin ${actingAdminId}`);
    return { success: true, message: 'نقش حذف شد' };
  }

  // ═══════════════════════════════════════════════════════════
  // 👤 Current Admin (Self)
  // ═══════════════════════════════════════════════════════════

  /**
   * پروفایل ادمین فعلی + مجوزهای نقشش
   * بدون نیاز به هیچ permission — هر ادمین می‌تونه خودش رو ببینه
   * برای رندر سایدبار/دکمه‌ها در فرانت‌اند استفاده می‌شه
   */
  async getMe(userId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isBanned: true,
          },
        },
      },
    });

    if (!admin) {
      throw new NotFoundException('پروفایل ادمین یافت نشد');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('حساب ادمین شما غیرفعال شده است');
    }

    return {
      id: admin.id,
      userId: admin.userId,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      role: {
        id: admin.role.id,
        name: admin.role.name,
        description: admin.role.description,
        isSystem: admin.role.isSystem,
      },
      permissions: admin.role.permissions.map((rp) => rp.permission.code),
      user: admin.user,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 📋 Audit Log
  // ═══════════════════════════════════════════════════════════

  /**
   * لیست لاگ‌های فعالیت ادمین‌ها با فیلتر و pagination
   */
  async listActivityLogs(dto: QueryActivityLogsDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 30;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.action) where.action = { equals: dto.action };
    if (dto.adminId) where.adminId = dto.adminId;
    if (dto.targetType) where.targetType = dto.targetType;
    if (dto.targetId) where.targetId = dto.targetId;

    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { targetId: { contains: q, mode: 'insensitive' } },
        {
          admin: {
            user: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) where.createdAt.gte = new Date(dto.from);
      if (dto.to) where.createdAt.lte = new Date(dto.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminActivityLog.findMany({
        where,
        include: {
          admin: {
            include: {
              user: {
                select: { id: true, name: true, email: true, phone: true },
              },
              role: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminActivityLog.count({ where }),
    ]);

    // ──── Phase 24: Enrich targetLabel (batch-fetch, no N+1) ────
    const userIds = new Set<string>();
    const businessIds = new Set<string>();
    const adminIds = new Set<string>();
    const roleIds = new Set<string>();
    const bookingIds = new Set<string>();

    for (const log of items) {
      if (!log.targetId || !log.targetType) continue;
      if (log.targetType === 'User') userIds.add(log.targetId);
      else if (log.targetType === 'Business') businessIds.add(log.targetId);
      else if (log.targetType === 'Admin') adminIds.add(log.targetId);
      else if (log.targetType === 'AdminRole') roleIds.add(log.targetId);
      else if (log.targetType === 'Booking') bookingIds.add(log.targetId);
    }

    const [users, businesses, admins, roles, bookings] = await Promise.all([
      userIds.size > 0
        ? this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, name: true, email: true, phone: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string | null; email: string | null; phone: string | null }>),
      businessIds.size > 0
        ? this.prisma.business.findMany({
            where: { id: { in: [...businessIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      adminIds.size > 0
        ? this.prisma.admin.findMany({
            where: { id: { in: [...adminIds] } },
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          })
        : Promise.resolve([] as Array<{ id: string; user: { name: string | null; email: string | null } }>),
      roleIds.size > 0
        ? this.prisma.adminRole.findMany({
            where: { id: { in: [...roleIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      bookingIds.size > 0
        ? this.prisma.booking.findMany({
            where: { id: { in: [...bookingIds] } },
            select: {
              id: true,
              customer: { select: { name: true, email: true } },
              business: { select: { name: true } },
            },
          })
        : Promise.resolve([] as Array<{ id: string; customer: { name: string | null; email: string | null }; business: { name: string } }>),
    ]);

    const userMap = new Map(
      users.map((u) => [u.id, u.name || u.email || u.phone || 'کاربر حذف‌شده']),
    );
    const businessMap = new Map(businesses.map((b) => [b.id, b.name]));
    const adminMap = new Map(
      admins.map((a) => [a.id, a.user.name || a.user.email || 'ادمین حذف‌شده']),
    );
    const roleMap = new Map(roles.map((r) => [r.id, r.name]));
    const bookingMap = new Map(
      bookings.map((b) => [
        b.id,
        `${b.customer.name || b.customer.email || 'مشتری'} — ${b.business.name}`,
      ]),
    );

    const enriched = items.map((log) => {
      let targetLabel: string | null = null;
      if (log.targetId && log.targetType) {
        switch (log.targetType) {
          case 'User':
            targetLabel = userMap.get(log.targetId) ?? 'کاربر حذف‌شده';
            break;
          case 'Business':
            targetLabel = businessMap.get(log.targetId) ?? 'کسب‌وکار حذف‌شده';
            break;
          case 'Admin':
            targetLabel = adminMap.get(log.targetId) ?? 'ادمین حذف‌شده';
            break;
          case 'AdminRole':
            targetLabel = roleMap.get(log.targetId) ?? 'نقش حذف‌شده';
            break;
          case 'Booking':
            targetLabel = bookingMap.get(log.targetId) ?? 'رزرو حذف‌شده';
            break;
        }
      }
      return { ...log, targetLabel };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      items: enriched,
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
}
