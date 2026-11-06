import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogData {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * سرویس لاگ فعالیت ادمین (Audit Log)
 *
 * وظیفه: ثبت هر عملیات حساس که توسط ادمین انجام می‌شه.
 * - هرگز جلوی عملیات اصلی رو نمی‌گیره (fail-safe)
 * - خطا فقط لاگ می‌شه و به کاربر برنمی‌گرده
 *
 * مثال action ها:
 * - "user.change-role"
 * - "user.ban" / "user.unban"
 * - "booking.change-status"
 * - "admin.create" / "admin.delete"
 */
@Injectable()
export class AdminActivityLogger {
  private readonly logger = new Logger(AdminActivityLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(data: LogData): Promise<void> {
    try {
      await this.prisma.adminActivityLog.create({
        data: {
          adminId: data.adminId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          metadata: (data.metadata as any) ?? undefined,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (err) {
      // هرگز عملیات اصلی رو نشکن
      this.logger.error(
        `Failed to write admin activity log (${data.action}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
