import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, SiteReview, SiteReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeText } from '../common/utils/sanitize.util';
import { CreateSiteReviewDto } from './dto/create-site-review.dto';
import { UpdateSiteReviewDto } from './dto/update-site-review.dto';
import { QuerySiteReviewsDto } from './dto/query-site-reviews.dto';

// ═══════════════════════════════════════════════════════════════
// 🎯 Types & Constants
// ═══════════════════════════════════════════════════════════════

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

/**
 * نرمال‌سازی یک نظر برای خروجی API
 */
function normalizeReview(r: SiteReview) {
  return {
    id: r.id,
    rating: r.rating,
    title: r.title,
    text: r.text,
    status: r.status,
    rejectReason: r.rejectReason,
    moderatedAt: r.moderatedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    name: r.user?.name || 'کاربر رزویو',
  };
}

// ═══════════════════════════════════════════════════════════════
// 📋 SiteReviewsService — Customer-facing
// ═══════════════════════════════════════════════════════════════

@Injectable()
export class SiteReviewsService {
  private readonly logger = new Logger(SiteReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ثبت نظر کاربر درباره سایت
   * - هر کاربر فقط یک نظر دارد (unique constraint + بررسی اپلیکیشن)
   * - نظر در وضعیت PENDING ثبت می‌شود (برای بررسی ادمین)
   */
  async create(userId: string, dto: CreateSiteReviewDto) {
    // بررسی قبلی (fast path) — جلوگیری از نظر تکراری
    const existing = await this.prisma.siteReview.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'شما قبلاً نظر خود را ثبت کرده‌اید. برای تغییر آن از گزینه ویرایش استفاده کنید.',
      );
    }

    const sanitizedText = sanitizeText(dto.text);
    if (sanitizedText.length < 10) {
      throw new BadRequestException(
        'متن نظر پس از پاک‌سازی کمتر از ۱۰ کاراکتر است',
      );
    }
    const sanitizedTitle = dto.title ? sanitizeText(dto.title) : null;

    try {
      return await this.prisma.siteReview.create({
        data: {
          userId,
          rating: dto.rating,
          title: sanitizedTitle,
          text: sanitizedText,
          status: SiteReviewStatus.PENDING,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });
    } catch (err: unknown) {
      // دفاع در برابر race condition: دو درخواست همزمان با یک userId
      // یکی از آن‌ها با P2002 (یا pg-native 23505) روی unique constraint شکست می‌خورد.
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002' || code === '23505') {
        throw new ConflictException(
          'شما قبلاً نظر خود را ثبت کرده‌اید. برای تغییر آن از گزینه ویرایش استفاده کنید.',
        );
      }
      throw err;
    }
  }

  /**
   * لیست نظرات تأییدشده (public با optional auth)
   * - فقط نظرات APPROVED نمایش داده می‌شوند
   * - summary (میانگین + توزیع) مستقل از pagination محاسبه می‌شود
   */
  async list(query: QuerySiteReviewsDto, currentUserId?: string) {
    const rating = query.rating;
    const sort = query.sort || 'newest';
    const q = query.q?.trim();
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // ──── where clause (فقط APPROVED) ────
    const where: Prisma.SiteReviewWhereInput = { status: SiteReviewStatus.APPROVED };
    if (rating) where.rating = rating;
    if (q) {
      where.OR = [
        { text: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // ──── orderBy ────
    let orderBy: Prisma.SiteReviewOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
    ];
    if (sort === 'highest') {
      orderBy = [{ rating: 'desc' }, { createdAt: 'desc' }];
    } else if (sort === 'lowest') {
      orderBy = [{ rating: 'asc' }, { createdAt: 'desc' }];
    }

    // ──── Summary (مستقل از pagination — روی همه نظرات تأییدشده) ────
    const [ratings, count, items] = await Promise.all([
      this.prisma.siteReview.findMany({
        where: { status: SiteReviewStatus.APPROVED },
        select: { rating: true },
      }),
      this.prisma.siteReview.count({ where }),
      this.prisma.siteReview.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    const distribution = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const r of ratings) {
      sum += r.rating;
      distribution[5 - r.rating] += 1;
    }
    const summary = {
      average: ratings.length ? Number((sum / ratings.length).toFixed(2)) : 0,
      count: ratings.length,
      distribution,
    };

    return {
      items: items.map(normalizeReview),
      meta: buildPaginationMeta(count, page, limit),
      summary,
    };
  }

  /**
   * جمع‌بندی نظرات تأییدشده (میانگین + تعداد + توزیع ستاره)
   * برای نمایش در بالای بخش نظرات
   */
  async summary() {
    const ratings = await this.prisma.siteReview.findMany({
      where: { status: SiteReviewStatus.APPROVED },
      select: { rating: true },
    });

    const distribution = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const r of ratings) {
      sum += r.rating;
      distribution[5 - r.rating] += 1;
    }

    return {
      average: ratings.length ? Number((sum / ratings.length).toFixed(2)) : 0,
      count: ratings.length,
      distribution,
    };
  }

  /**
   * لیست نظرات من (همه وضعیت‌ها — PENDING/APPROVED/REJECTED)
   */
  async mine(userId: string) {
    const page = 1;
    const limit = 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.siteReview.findMany({
        where: { userId },
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.siteReview.count({ where: { userId } }),
    ]);

    return {
      items: items.map(normalizeReview),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * جزئیات یک نظر
   * - نظرات غير APPROVED فقط برای خود نظردهنده قابل مشاهده است
   */
  async findOne(id: string, currentUserId?: string) {
    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }
    if (
      review.status !== SiteReviewStatus.APPROVED &&
      review.userId !== currentUserId
    ) {
      // برای کاربر عادی، نظرات غير تأییدشده دیده نمی‌شود (نوشتن ۴۰۴)
      throw new NotFoundException('نظر یافت نشد');
    }

    return normalizeReview(review);
  }

  /**
   * ویرایش نظر (فقط نظر خود)
   * - ویرایش وضعیت را دوباره به PENDING برمی‌گرداند (بررسی مجدد)
   * - دلیل رد قبلی پاک می‌شود
   */
  async update(userId: string, id: string, dto: UpdateSiteReviewDto) {
    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('فقط نظر خود را می‌توانید ویرایش کنید');
    }

    const sanitizedText = sanitizeText(dto.text);
    if (sanitizedText.length < 10) {
      throw new BadRequestException(
        'متن نظر پس از پاک‌سازی کمتر از ۱۰ کاراکتر است',
      );
    }
    const sanitizedTitle = dto.title ? sanitizeText(dto.title) : null;

    return this.prisma.siteReview.update({
      where: { id },
      data: {
        rating: dto.rating,
        title: sanitizedTitle,
        text: sanitizedText,
        // ویرایش = ارسال مجدد برای بررسی
        status: SiteReviewStatus.PENDING,
        rejectReason: null,
        moderatedBy: null,
        moderatedAt: null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * حذف نظر (فقط نظر خود)
   */
  async remove(userId: string, id: string) {
    const review = await this.prisma.siteReview.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('نظر یافت نشد');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('فقط نظر خود را می‌توانید حذف کنید');
    }

    await this.prisma.siteReview.delete({ where: { id } });
    this.logger.log(`Site review ${id} deleted by owner ${userId}`);
    return { message: 'نظر حذف شد' };
  }
}
