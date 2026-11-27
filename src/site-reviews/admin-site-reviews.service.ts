import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, SiteReview, SiteReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActivityLogger } from '../admin/admin-activity-logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { sanitizeText } from '../common/utils/sanitize.util';
import { QueryAdminSiteReviewsDto } from './dto/query-site-reviews.dto';
import { RejectSiteReviewDto } from './dto/reject-site-review.dto';

// ═══════════════════════════════════════════════════════════════
// 🎯 Types & Constants
// ═══════════════════════════════════════════════════════════════

export interface AdminCtx {
  ip?: string;
  userAgent?: string;
}

/**
 * ساخت meta استاندارد pagination
 */
function buildPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

function normalizeReview(r: SiteReview) {
  return {
    id: r.id,
    userId: r.userId,
    rating: r.rating,
    title: r.title,
    text: r.text,
    status: r.status,
    rejectReason: r.rejectReason,
    moderatedBy: r.moderatedBy,
    moderatedAt: r.moderatedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    name: r.user?.name || 'کاربر رزویو',
  };
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ AdminSiteReviewsService — Admin-facing
// ═══════════════════════════════════════════════════════════════

@Injectable()
export class AdminSiteReviewsService {
  private readonly logger = new Logger(AdminSiteReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: AdminActivityLogger,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ──── Read ────

  /**
   * لیست همه نظرات (cross-user) با فیلتر پیشرفته + pagination
   * مرتب‌سازی: PENDING أوّل (صف بررسی)، سپس جدیدترین
   */
  async findAll(dto: QueryAdminSiteReviewsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SiteReviewWhereInput = {};

    if (dto.status) where.status = dto.status;
    if (dto.rating) where.rating = dto.rating;
    if (dto.userId) where.userId = dto.userId;
    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { text: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.siteReview.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        // PENDING أوّل، سپس بر اساس امتیاز/تاریخ
        orderBy: [
          { status: 'asc' },
          { rating: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.siteReview.count({ where }),
    ]);

    return { items: items.map(normalizeReview), meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * جزئیات کامل نظر
   */
  async findOne(id: string) {
    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }
    return normalizeReview(review);
  }

  // ──── Mutations (all audited) ────

  /**
   * تأیید نظر (PENDING → APPROVED)
   * - بررسی یک‌طرفه: نظرات قبلاً بررسی‌شده قابل تأیید مجدد نیستند (۴۰۹)
   */
  async approve(adminUserId: string, id: string, ctx: AdminCtx) {
    const admin = await this.getAdminProfile(adminUserId);

    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }
    if (review.status !== SiteReviewStatus.PENDING) {
      throw new ConflictException(
        `این نظر در وضعیت ${review.status} است و قابل بررسی مجدد نیست`,
      );
    }

    const updated = await this.prisma.siteReview.update({
      where: { id },
      data: {
        status: SiteReviewStatus.APPROVED,
        rejectReason: null,
        moderatedBy: admin.id, // ← Admin.id
        moderatedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Audit (fail-safe — هرگز جلوی عملیات اصلی نمی‌ایستد)
    await this.activityLogger.log({
      adminId: admin.id,
      action: 'site-review.approve',
      targetType: 'SiteReview',
      targetId: id,
      metadata: { from: review.status, to: SiteReviewStatus.APPROVED },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(`Admin ${admin.id} approved site review ${id}`);

    // ──── Phase 28A: اعلان به نظردهنده (fail-safe) ────
    this.notificationsService
      .create(
        review.userId,
        NotificationType.SITE_REVIEW_APPROVED,
        'نظر شما تأیید شد',
        'نظر شما درباره‌ی رزویو توسط تیم بررسی شد و در بخش نظرات نمایش داده شد.',
        { siteReviewId: id },
      )
      .catch(() => {});

    return normalizeReview(updated);
  }

  /**
   * رد نظر (PENDING → REJECTED) با دلیل اختیاری
   * - بررسی یک‌طرفه: نظرات قبلاً بررسی‌شده قابل رد مجدد نیستند (۴۰۹)
   */
  async reject(
    adminUserId: string,
    id: string,
    dto: RejectSiteReviewDto,
    ctx: AdminCtx,
  ) {
    const admin = await this.getAdminProfile(adminUserId);

    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }
    if (review.status !== SiteReviewStatus.PENDING) {
      throw new ConflictException(
        `این نظر در وضعیت ${review.status} است و قابل بررسی مجدد نیست`,
      );
    }

    const sanitizedReason = dto.reason ? sanitizeText(dto.reason) : null;
    if (sanitizedReason && sanitizedReason.length > 255) {
      throw new BadRequestException('دلیل رد نمی‌تواند بیش از ۲۵۵ کاراکتر باشد');
    }

    const updated = await this.prisma.siteReview.update({
      where: { id },
      data: {
        status: SiteReviewStatus.REJECTED,
        rejectReason: sanitizedReason,
        moderatedBy: admin.id,
        moderatedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    await this.activityLogger.log({
      adminId: admin.id,
      action: 'site-review.reject',
      targetType: 'SiteReview',
      targetId: id,
      metadata: {
        from: review.status,
        to: SiteReviewStatus.REJECTED,
        rejectReason: sanitizedReason,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(`Admin ${admin.id} rejected site review ${id}`);

    // ──── Phase 28A: اعلان به نظردهنده با دلیل (fail-safe) ────
    const body = sanitizedReason
      ? `نظر شما درباره‌ی رزویو بررسی نشد. دلیل: ${sanitizedReason}`
      : 'نظر شما درباره‌ی رزویو بررسی نشد. می‌توانید نظر خود را ویرایش و دوباره ارسال کنید.';
    this.notificationsService
      .create(
        review.userId,
        NotificationType.SITE_REVIEW_REJECTED,
        'نظر شما رد شد',
        body,
        { siteReviewId: id, rejectReason: sanitizedReason },
      )
      .catch(() => {});

    return normalizeReview(updated);
  }

  /**
   * حذف کامل نظر (برای محتوای تبلیغاتی/مخالف — hard delete)
   * هر نظر فقط یک بار قابل حذف است؛ حذف در audit log ثبت می‌شود
   */
  async remove(adminUserId: string, id: string, ctx: AdminCtx) {
    const admin = await this.getAdminProfile(adminUserId);

    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      select: { id: true, status: true, rating: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }

    const deleted = await this.prisma.siteReview.delete({ where: { id } });

    await this.activityLogger.log({
      adminId: admin.id,
      action: 'site-review.delete',
      targetType: 'SiteReview',
      targetId: id,
      metadata: {
        status: review.status,
        rating: review.rating,
        userId: review.userId,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.log(`Admin ${admin.id} deleted site review ${id}`);
    return deleted;
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
