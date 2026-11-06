import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUserDto } from '../../auth/dto/auth-response.dto';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Permission Guard — RBAC granular
 *
 * منطق:
 * 1. اگه route @RequirePermissions نداشت → allow
 * 2. کاربر باید role=ADMIN داشته باشه
 * 3. ادمین باید isActive=true باشه
 * 4. کاربر باید ALL permissions تعریف‌شده رو داشته باشه
 *
 * استفاده (always after JwtAuthGuard):
 *   @UseGuards(JwtAuthGuard, PermissionGuard)
 *   @RequirePermissions('user:view')
 *
 * Cache: مجوزهای ادمین برای ۵ دقیقه کش می‌شن (admin-perm:{userId}).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUserDto | undefined = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('دسترسی غیرمجاز: کاربر احراز هویت نشده است');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        `دسترسی غیرمجاز: نیاز به نقش ADMIN (نقش فعلی: ${user.role})`,
      );
    }

    const cacheKey = `admin-perm:${user.id}`;
    let adminPermissions = await this.cache.get<string[]>(cacheKey);

    if (!adminPermissions) {
      const admin = await this.prisma.admin.findUnique({
        where: { userId: user.id },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      if (!admin) {
        this.logger.warn(
          `Admin profile missing for user ${user.id} (role=ADMIN) — access denied`,
        );
        throw new ForbiddenException(
          'پروفایل ادمین یافت نشد. لطفاً با مدیر سایت تماس بگیرید.',
        );
      }

      if (!admin.isActive) {
        this.logger.warn(`Inactive admin attempted access: ${user.id}`);
        throw new ForbiddenException('حساب ادمین شما غیرفعال شده است');
      }

      adminPermissions = admin.role.permissions.map((rp) => rp.permission.code);
      await this.cache.set(cacheKey, adminPermissions, PermissionGuard.CACHE_TTL_MS);
    }

    const hasAllPermissions = requiredPermissions.every((perm) =>
      adminPermissions!.includes(perm),
    );

    if (!hasAllPermissions) {
      const missing = requiredPermissions.filter(
        (perm) => !adminPermissions!.includes(perm),
      );
      this.logger.warn(
        `Permission denied for admin ${user.id}: missing [${missing.join(', ')}]`,
      );
      throw new ForbiddenException(
        `دسترسی کافی ندارید. مجوزهای لازم: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}